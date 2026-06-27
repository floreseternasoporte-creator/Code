require('dotenv').config();
const express = require('express');
const path    = require('path');
const twilio  = require('twilio');
const admin   = require('firebase-admin');

const app = express();
app.use(express.json());

/* ─── Firebase Admin ───
   OJO: estas variables son del Admin SDK (cuenta de servicio) y son
   DISTINTAS del firebaseConfig público que está dentro del <script> de
   index.html. Ese firebaseConfig (apiKey, authDomain, etc.) solo le
   permite al NAVEGADOR hablar con Firebase como cliente; no sirve para
   generar Custom Tokens. Por eso no "se conecta solo" — el login por
   OTP necesita que el SERVIDOR tenga estas credenciales para poder
   crear el token con el que el front end hace signInWithCustomToken.
   Si faltan, no tumbamos el server: solo desactivamos /firebase-token
   con un error claro hasta que se configuren en Railway → Variables. */
const firebaseAdminReady =
  !!process.env.FIREBASE_PROJECT_ID &&
  !!process.env.FIREBASE_CLIENT_EMAIL &&
  !!process.env.FIREBASE_PRIVATE_KEY;

if (firebaseAdminReady) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
} else {
  console.warn(
    '⚠️  Faltan variables de Firebase Admin (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY). ' +
    'El servidor sigue corriendo, pero /firebase-token (y por lo tanto el login con OTP) NO va a funcionar ' +
    'hasta que las configures en Railway → Variables.'
  );
}

/* ─── Twilio ─── */
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/* ─── OTP Store en memoria ─── */
// Guarda { code, exp } por número de teléfono.
// Para producción seria reemplaza esto con Redis.
const otpStore = new Map();

/* ════════════════════════════════════════════
   ENDPOINT 1: Enviar OTP por SMS via Twilio
   POST /send-otp
   Body: { phone: "+521234567890" }
════════════════════════════════════════════ */
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ error: 'Se requiere el campo phone.' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { code, exp: Date.now() + 5 * 60 * 1000 }); // expira en 5 min

  try {
    await twilioClient.messages.create({
      body: `Tu código de Message es: ${code}. Válido por 5 minutos.`,
      from: process.env.TWILIO_PHONE,
      to:   phone
    });
    console.log(`OTP enviado a ${phone}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Twilio error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════
   ENDPOINT 2: Verificar OTP
   POST /verify-otp
   Body: { phone: "+52...", code: "123456" }
════════════════════════════════════════════ */
app.post('/verify-otp', (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    return res.status(400).json({ error: 'Se requieren phone y code.' });
  }

  const entry = otpStore.get(phone);
  if (!entry) {
    return res.status(400).json({ error: 'No hay código pendiente para este número.' });
  }
  if (Date.now() > entry.exp) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'El código expiró. Solicita uno nuevo.' });
  }
  if (entry.code !== code.toString().trim()) {
    return res.status(400).json({ error: 'Código incorrecto.' });
  }

  // Código válido — NO lo eliminamos aún, lo elimina /firebase-token
  res.json({ ok: true });
});

/* ════════════════════════════════════════════
   ENDPOINT 3: Crear Firebase Custom Token
   POST /firebase-token
   Body: { phone: "+52..." }
════════════════════════════════════════════ */
app.post('/firebase-token', async (req, res) => {
  if (!firebaseAdminReady) {
    return res.status(500).json({
      error: 'Firebase Admin no está configurado en el servidor (faltan FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY en Railway → Variables).'
    });
  }
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Se requiere phone.' });
  }

  // Verificamos que el OTP fue validado (entry aún existe)
  const entry = otpStore.get(phone);
  if (!entry) {
    return res.status(403).json({ error: 'Verifica el código primero.' });
  }
  otpStore.delete(phone); // consumir el código

  try {
    // UID estable basado en el teléfono
    const uid = 'phone_' + phone.replace(/\D/g, '');
    const token = await admin.auth().createCustomToken(uid, { phone });
    res.json({ token });
  } catch (err) {
    console.error('Firebase Admin error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── Sirve el HTML estático ─── */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ─── Health check ─── */
app.get('/health', (req, res) => res.json({ status: 'ok' }));

/* ─── Arranque ─── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Message by Drex corriendo en puerto ${PORT}`));
