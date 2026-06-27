const express = require('express');
const path    = require('path');
const app     = express();

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Baro Mail corriendo en puerto ${PORT}`));
