const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Busboy = require('busboy');

admin.initializeApp();
const db = admin.database();

const BARO_DOMAIN = 'baro.com';
const EXTERNAL_COLOR = '#5B8A72';

/**
 * Extrae nombre y email de un string tipo "Nombre <email@dominio.com>"
 */
function parseFromHeader(fromStr) {
  if (!fromStr) return { name: '', email: '' };
  
  // Patrón: Nombre <email@dominio.com>
  const match = fromStr.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ''),
      email: match[2].trim().toLowerCase()
    };
  }
  
  // Si solo es el email
  return { name: '', email: fromStr.trim().toLowerCase() };
}

/**
 * Extrae el nombre de usuario de una dirección @baro.com
 */
function extractUsername(email) {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  if (clean.endsWith('@' + BARO_DOMAIN)) {
    return clean.replace('@' + BARO_DOMAIN, '');
  }
  return null;
}

/**
 * Sanitiza el cuerpo del correo para guardarlo como texto plano
 */
function sanitizeBody(text, html) {
  // Preferimos texto plano si está disponible
  if (text && text.trim()) {
    return text.trim().substring(0, 50000); // límite de 50k chars
  }
  
  // Si solo hay HTML, quitamos las etiquetas básicas
  if (html) {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
      .substring(0, 50000);
  }
  
  return '(sin contenido)';
}

/**
 * Webhook para recibir correos de SendGrid Inbound Parse
 * 
 * Configuración en SendGrid:
 * - Host: mail.baro.com (o el subdominio que elijas)
 * - URL: https://us-central1-tu-proyecto.cloudfunctions.net/receiveEmail
 * - POST raw: No (dejar desactivado, envía multipart/form-data)
 */
exports.receiveEmail = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const fields = {};
  
  try {
    // Parsear multipart/form-data con busboy
    const busboy = Busboy({ headers: req.headers });
    
    busboy.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });
    
    busboy.on('finish', async () => {
      try {
        // Extraer datos del correo
        const fromStr = fields.from || '';
        const toStr = fields.to || '';
        const subject = fields.subject || '(sin asunto)';
        const textBody = fields.text || '';
        const htmlBody = fields.html || '';
        
        const { name: fromName, email: fromEmail } = parseFromHeader(fromStr);
        
        // El destinatario puede ser múltiple, tomamos el primero que sea @baro.com
        const toEmails = toStr.split(',').map(s => s.trim());
        let targetUsername = null;
        let targetEmail = '';
        
        for (const to of toEmails) {
          const { email } = parseFromHeader(to);
          const username = extractUsername(email);
          if (username) {
            targetUsername = username;
            targetEmail = email;
            break;
          }
        }
        
        if (!targetUsername) {
          console.warn('No se encontró un destinatario @baro.com válido:', toStr);
          return res.status(200).send('OK (ignorado, no hay destinatario @baro.com)');
        }
        
        // Verificar que el usuario exista
        const userSnap = await db.ref('baro_usernames/' + targetUsername).get();
        if (!userSnap.exists()) {
          console.warn('Usuario no encontrado:', targetUsername);
          return res.status(200).send('OK (usuario no existe)');
        }
        
        const uid = userSnap.val();
        const userDataSnap = await db.ref('baro_users/' + uid).get();
        const userData = userDataSnap.val() || {};
        
        // Preparar el correo para guardar
        const mailData = {
          from: fromEmail || 'desconocido@externo.com',
          fromName: fromName || (fromEmail ? fromEmail.split('@')[0] : 'Desconocido'),
          fromColor: EXTERNAL_COLOR,
          to: targetEmail,
          toName: userData.name || targetUsername,
          toColor: userData.avatarColor || '#CC785C',
          subject: subject,
          body: sanitizeBody(textBody, htmlBody),
          timestamp: Date.now(),
          read: false,
          starred: false,
          external: true,
          source: 'sendgrid-inbound'
        };
        
        // Guardar en la base de datos
        const newMailRef = await db.ref('baro_mails').push(mailData);
        
        console.log('Correo recibido y guardado:', {
          id: newMailRef.key,
          from: mailData.from,
          to: mailData.to,
          subject: mailData.subject
        });
        
        return res.status(200).send('OK');
        
      } catch (err) {
        console.error('Error procesando correo:', err);
        return res.status(500).send('Internal Server Error');
      }
    });
    
    busboy.on('error', (err) => {
      console.error('Error de busboy:', err);
      return res.status(400).send('Bad Request');
    });
    
    // Pipe el request a busboy
    req.pipe(busboy);
    
  } catch (err) {
    console.error('Error general:', err);
    return res.status(500).send('Internal Server Error');
  }
});

/**
 * Función auxiliar para probar la recepción (opcional)
 * Útil para depurar sin necesidad de enviar un correo real
 */
exports.testReceive = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }
  
  try {
    const { to, from, subject, body } = req.body;
    
    if (!to || !from) {
      return res.status(400).json({ error: 'Faltan campos: to, from' });
    }
    
    const username = extractUsername(to);
    if (!username) {
      return res.status(400).json({ error: 'El destinatario debe ser @baro.com' });
    }
    
    const userSnap = await db.ref('baro_usernames/' + username).get();
    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const uid = userSnap.val();
    const userDataSnap = await db.ref('baro_users/' + uid).get();
    const userData = userDataSnap.val() || {};
    
    const mailData = {
      from: from.toLowerCase(),
      fromName: from.split('@')[0],
      fromColor: EXTERNAL_COLOR,
      to: to.toLowerCase(),
      toName: userData.name || username,
      toColor: userData.avatarColor || '#CC785C',
      subject: subject || '(sin asunto)',
      body: body || '',
      timestamp: Date.now(),
      read: false,
      starred: false,
      external: true,
      source: 'test'
    };
    
    const newMailRef = await db.ref('baro_mails').push(mailData);
    
    return res.json({ 
      success: true, 
      mailId: newMailRef.key,
      message: 'Correo de prueba guardado exitosamente'
    });
    
  } catch (err) {
    console.error('Error en testReceive:', err);
    return res.status(500).json({ error: err.message });
  }
});
