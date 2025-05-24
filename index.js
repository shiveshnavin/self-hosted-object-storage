const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv')
dotenv.config()

const app = express();
const STORAGE = path.join(__dirname, "storage");

async function getTokenInfo(token) {
  try {
    const decoded = jwt.verify(token, process.env.SECRET || 'aezakmi');
    return {
      regex: new RegExp(decoded.path),
    };
  } catch (err) {
    console.error('Invalid token:', err.message);
    return null;
  }
}


app.put("/:token/{*any}", async (req, res) => {
  const relPath = req.params.any.join("/");
  const dest = path.join(STORAGE, relPath);
  if (!fs.existsSync(path.dirname(dest)))
    fs.mkdirSync(path.dirname(dest), { recursive: true });

  const writeStream = fs.createWriteStream(dest);
  req.pipe(writeStream);
  writeStream.on("finish", () => {
    console.log('uploaded', relPath)
    res.json({ success: true, path: relPath })
  });
  writeStream.on("error", (err) =>
    res.status(500).json({ error: err.message })
  );
});

app.delete("/:token/{*any}", async (req, res) => {
  const relPath = req.params.any.join("/");
  const target = path.join(STORAGE, relPath);
  if (!fs.existsSync(target)) return res.status(404).send("Not found");

  fs.unlinkSync(target);

  let dir = path.dirname(target);
  const stop = path.join(STORAGE);
  while (
    dir.startsWith(stop) &&
    fs.existsSync(dir) &&
    fs.readdirSync(dir).length === 0
  ) {
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
  console.log('deleted', relPath)
  res.json({ success: true });
});

app.use('/:token/{*any}', async (req, res, next) => {
  const token = req.params.token;
  let fullPath = '/' + req.params[0];
  if (Array.isArray(req.params.any)) {
    fullPath = '/' + req.params.any.join("/");
  }
  if (!fullPath) {
    return res.send(401).send('Missing token')
  }
  const tokenInfo = await getTokenInfo(token);
  if (!tokenInfo || !tokenInfo.regex) {
    return res.status(403).send('Forbidden: Invalid token');
  }

  if (tokenInfo.regex.test(fullPath)) {
    console.log('auth OK', req.url)
    next()
  } else {
    return res.status(403).send('Forbidden: Path not allowed');
  }
})

app.use((req, res) => {
  res.send({
    message: 'OK'
  })
})

const PORT = process.env.PORT || 8000
app.listen(PORT, () => console.log("objectstorage running on port ", PORT));
