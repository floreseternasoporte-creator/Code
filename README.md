# 📬 Baro Mail - Sistema de Correo Real

Aplicación de correo personal con recepción de correos reales desde cualquier plataforma (Gmail, Yahoo, Outlook, etc.).

---

## 📋 Requisitos previos

Antes de empezar, necesitas:

1. ✅ **Un dominio propio** (ej: `baro.com`) con acceso a la configuración DNS
2. ✅ **Cuenta de SendGrid** (gratuita para hasta 100 correos/día)
3. ✅ **Firebase CLI** instalado en tu computadora
4. ✅ **Node.js 18+** instalado

---

## 🚀 Guía de configuración paso a paso

### Paso 1: Configurar SendGrid

1. Crea una cuenta en [sendgrid.com](https://sendgrid.com) (el plan gratuito sirve)
2. Ve a **Settings > Sender Authentication**
3. Autentica tu dominio (Domain Authentication)
4. Sigue las instrucciones para agregar los registros DNS que SendGrid te indica

### Paso 2: Configurar Inbound Parse en SendGrid

1. En SendGrid, ve a **Settings > Inbound Parse**
2. Clic en **"Add Host & URL"**
3. Configura:
   - **Subdomain**: `mail` (quedará `mail.baro.com`)
   - **Domain**: `baro.com` (tu dominio)
   - **Destination URL**: La URL de tu Firebase Function (la obtendrás en el paso 4)
   - **POST raw**: ❌ Desactivado (importante)
   - **Send raw**: ❌ Desactivado
   - **Spam Check**: ✅ Activado (opcional, recomendado)
4. Clic en **"Add"**

### Paso 3: Configurar registros DNS MX

En tu proveedor de dominio (GoDaddy, Namecheap, Cloudflare, etc.), agrega este registro MX:

- **Tipo**: MX
- **Nombre/Host**: `mail` (el subdominio que elegiste)
- **Valor/Prioridad**: `10 mx.sendgrid.net`
- **TTL**: 300 (o el valor por defecto)

> ⚠️ **Importante**: No agregues este registro MX al dominio principal (`baro.com`), solo al subdominio (`mail.baro.com`). Si lo agregas al dominio principal, dejarán de llegar tus correos normales.

### Paso 4: Desplegar Firebase Functions

1. Instala las dependencias:
   ```bash
   cd functions
   npm install
   cd ..
   ```

2. Inicia sesión en Firebase:
   ```bash
   firebase login
   ```

3. Despliega las funciones:
   ```bash
   firebase deploy --only functions
   ```

4. Copia la URL de la función `receiveEmail` que te muestra Firebase. Se verá algo como:
   ```
   https://us-central1-ggggg-f2508.cloudfunctions.net/receiveEmail
   ```

5. Regresa a SendGrid Inbound Parse y pega esa URL en **Destination URL**

### Paso 5: Probar que funciona

1. Asegúrate de tener una cuenta creada en Baro Mail (ej: `tuusuario@baro.com`)
2. Desde tu correo personal (Gmail, etc.), envía un correo a:
   ```
   tuusuario@mail.baro.com
   ```
   (Nota: usa el subdominio `mail`, no el dominio directo)

3. Abre Baro Mail y revisa tu bandeja de entrada. El correo debería aparecer con la etiqueta **🌐 Externo**

> 💡 También puedes probar con la función de test:
> ```bash
> curl -X POST https://us-central1-ggggg-f2508.cloudfunctions.net/testReceive \
>   -H "Content-Type: application/json" \
>   -d '{"to":"tuusuario@baro.com","from":"prueba@gmail.com","subject":"Prueba","body":"Hola mundo"}'
> ```

---

## 📧 ¿Cómo funciona?

```
Tu amigo envía un correo → tu@mail.baro.com
         ↓
   SendGrid recibe el correo (MX record)
         ↓
   SendGrid envía un POST al webhook
         ↓
   Firebase Function procesa el correo
         ↓
   Se guarda en Firebase Realtime Database
         ↓
   Aparece en tu bandeja de entrada de Baro Mail ✅
```

---

## ⚙️ Funciones disponibles

### `receiveEmail`
Webhook principal que recibe los correos de SendGrid y los guarda en la base de datos.

### `testReceive`
Función auxiliar para probar la recepción sin necesidad de enviar un correo real. Útil para depuración.

---

## 🔒 Notas de seguridad

- Los correos se guardan en Firebase Realtime Database. Asegúrate de que tus reglas de seguridad protejan adecuadamente los datos.
- SendGrid Inbound Parse tiene límites en el plan gratuito. Si esperas muchos correos, considera un plan pago.
- El webhook no tiene autenticación actualmente. Para producción, considera agregar una clave secreta o verificar que la solicitud viene de SendGrid.

---

## 🆘 Solución de problemas

### No me llegan los correos
1. Verifica que el registro MX esté propagado:
   ```bash
   nslookup -type=MX mail.baro.com
   ```
   Debería mostrar `mx.sendgrid.net`

2. Revisa los logs de Firebase Functions:
   ```bash
   firebase functions:log --only receiveEmail
   ```

3. Asegúrate de que estás enviando al subdominio correcto (`@mail.baro.com`, no `@baro.com`)

### El correo llega pero no se ve en la app
1. Verifica que el nombre de usuario exista en `baro_usernames`
2. Revisa los logs de la función para ver si hay errores
3. Comprueba Firebase Realtime Database directamente en la consola

### Error de CORS
Las funciones de Firebase ya tienen CORS habilitado por defecto para solicitudes HTTP. Si tienes problemas, revisa la configuración de la función.

---

## 📝 Próximos pasos (opcional)

- [ ] Configurar envío de correos salientes reales con SendGrid
- [ ] Agregar soporte para archivos adjuntos
- [ ] Implementar filtro de spam
- [ ] Agregar autenticación al webhook
- [ ] Configurar dominio personalizado sin subdominio

---

## 🆚 Formulario público vs Correo real

| Característica | Formulario público | Correo real (SendGrid) |
|----------------|-------------------|------------------------|
| ¿Cómo envían? | A través de un formulario web | Desde cualquier cliente de correo (Gmail, etc.) |
| ¿Necesita dominio? | ❌ No | ✅ Sí |
| ¿Necesita servicios extra? | ❌ No | ✅ SendGrid + DNS |
| ¿Requiere backend? | ❌ No (usa auth anónima) | ✅ Sí (Firebase Functions) |
| ¿Pueden responder directamente? | No, tienen que volver al formulario | ✅ Sí, como cualquier correo |
| ¿Llega en tiempo real? | ✅ Sí | ✅ Sí |

**Recomendación**: Usa ambos. El formulario público para tu sitio web, y el correo real para dar tu dirección a contactos.
