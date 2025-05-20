// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const STORAGE = path.join(__dirname, "storage");
const TOKENS = JSON.parse(fs.readFileSync("./tokens.json"));

function findPrefix(token) {
  const entry = TOKENS.find((t) => t.token === token);
  return entry && entry.prefix;
}

app.put("/api/:token/{*any}", (req, res) => {
  const { token } = req.params;
  const prefix = findPrefix(token);
  if (!prefix) return res.status(403).send("Invalid token");

  const relPath = req.params.any.join("/");
  if (!relPath.startsWith(prefix))
    return res.status(403).send("Token not valid for this path");

  const dest = path.join(STORAGE, relPath);
  if (!fs.existsSync(path.dirname(dest)))
    fs.mkdirSync(path.dirname(dest), { recursive: true });

  const writeStream = fs.createWriteStream(dest);
  req.pipe(writeStream);
  writeStream.on("finish", () => res.json({ success: true, path: relPath }));
  writeStream.on("error", (err) =>
    res.status(500).json({ error: err.message })
  );
});

app.delete("/api/:token/{*any}", (req, res) => {
  const { token } = req.params;
  const prefix = findPrefix(token);
  if (!prefix) return res.status(403).send("Invalid token");

  const relPath = req.params.any.join("/");
  if (!relPath.startsWith(prefix))
    return res.status(403).send("Token not valid for this path");

  const target = path.join(STORAGE, relPath);
  if (!fs.existsSync(target)) return res.status(404).send("Not found");

  fs.unlinkSync(target);

  // cleanup empty dirs up to STORAGE/prefix
  let dir = path.dirname(target);
  const stop = path.join(STORAGE, prefix);
  while (
    dir.startsWith(stop) &&
    fs.existsSync(dir) &&
    fs.readdirSync(dir).length === 0
  ) {
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
  res.json({ success: true });
});

const PORT = process.env.PORT || 8000
app.listen(PORT, () => console.log("objectstorage running on port ", PORT));
