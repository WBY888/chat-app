const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./chat.db');
db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    content TEXT,
    type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.get('/api/messages', (req, res) => {
    const { userId } = req.query;
    db.all('SELECT * FROM messages WHERE userId = ? ORDER BY id ASC LIMIT 200', [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/send', (req, res) => {
    const { userId, content, type } = req.body;
    db.run('INSERT INTO messages (userId, content, type) VALUES (?, ?, ?)', [userId, content, type], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.get('/api/new-messages', (req, res) => {
    const { userId, lastId } = req.query;
    db.all('SELECT * FROM messages WHERE userId = ? AND id > ? ORDER BY id ASC', [userId, lastId || 0], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});