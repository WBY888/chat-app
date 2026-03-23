const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const db = new sqlite3.Database('./chat.db');
db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    content TEXT,
    type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 用户获取历史消息
app.get('/api/messages', (req, res) => {
    const { userId } = req.query;
    db.all('SELECT * FROM messages WHERE userId = ? ORDER BY id ASC LIMIT 200', [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 用户发送消息
app.post('/api/send', (req, res) => {
    const { userId, content, type } = req.body;
    db.run('INSERT INTO messages (userId, content, type) VALUES (?, ?, ?)', [userId, content, type], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// 用户轮询新消息
app.get('/api/new-messages', (req, res) => {
    const { userId, lastId } = req.query;
    db.all('SELECT * FROM messages WHERE userId = ? AND id > ? ORDER BY id ASC', [userId, lastId || 0], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ========== 管理员后台 ==========

// 管理员后台首页 - 显示所有用户
app.get('/admin', (req, res) => {
    db.all(`
        SELECT DISTINCT userId, MAX(created_at) as last_msg_time 
        FROM messages 
        GROUP BY userId 
        ORDER BY last_msg_time DESC
    `, (err, users) => {
        if (err) return res.status(500).send(err.message);
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>客服后台</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; padding: 20px; }
                h1 { font-size: 24px; margin-bottom: 20px; }
                .user-list { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                .user-item { padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
                .user-item:last-child { border-bottom: none; }
                .user-id { font-size: 14px; color: #333; word-break: break-all; flex: 1; }
                .user-time { font-size: 12px; color: #999; margin-right: 15px; }
                .reply-btn { background: #07c160; color: white; border: none; padding: 8px 16px; border-radius: 20px; font-size: 14px; cursor: pointer; text-decoration: none; display: inline-block; }
                .reply-btn:hover { background: #06ad56; }
                .no-users { padding: 40px; text-align: center; color: #999; }
            </style>
        </head>
        <body>
            <h1>📋 客服后台</h1>
            <div class="user-list">
        `;
        
        if (users && users.length > 0) {
            users.forEach(user => {
                html += `
                <div class="user-item">
                    <div class="user-id">${user.userId}</div>
                    <div class="user-time">${user.last_msg_time || ''}</div>
                    <a href="/admin/chat/${user.userId}" class="reply-btn">回复</a>
                </div>
                `;
            });
        } else {
            html += `<div class="no-users">暂无用户消息</div>`;
        }
        
        html += `</div></body></html>`;
        res.send(html);
    });
});

// 与指定用户的聊天页面
app.get('/admin/chat/:userId', (req, res) => {
    const userId = req.params.userId;
    
    db.all('SELECT * FROM messages WHERE userId = ? ORDER BY id ASC', [userId], (err, messages) => {
        if (err) return res.status(500).send(err.message);
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>与 ${userId} 聊天</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; height: 100vh; display: flex; flex-direction: column; }
                .chat-header { background: #07c160; color: white; padding: 15px; text-align: center; font-size: 16px; font-weight: 500; position: fixed; top: 0; width: 100%; z-index: 100; word-break: break-all; }
                .chat-messages { flex: 1; overflow-y: auto; padding: 70px 15px 80px 15px; }
                .message { margin-bottom: 15px; display: flex; }
                .message.user { justify-content: flex-end; }
                .message.admin { justify-content: flex-start; }
                .message .bubble { max-width: 70%; padding: 10px 12px; border-radius: 18px; font-size: 15px; line-height: 1.4; word-wrap: break-word; }
                .message.user .bubble { background: #07c160; color: white; border-bottom-right-radius: 4px; }
                .message.admin .bubble { background: white; color: #333; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
                .input-area { position: fixed; bottom: 0; width: 100%; background: white; padding: 10px 15px; border-top: 1px solid #e5e5e5; display: flex; gap: 10px; }
                .input-area input { flex: 1; padding: 10px 12px; border: 1px solid #ddd; border-radius: 25px; font-size: 15px; outline: none; }
                .input-area button { background: #07c160; color: white; border: none; padding: 0 20px; border-radius: 25px; font-size: 15px; cursor: pointer; }
                .back-link { position: fixed; top: 12px; left: 15px; color: white; text-decoration: none; font-size: 14px; z-index: 101; background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 20px; }
            </style>
        </head>
        <body>
            <a href="/admin" class="back-link">← 返回</a>
            <div class="chat-header">用户: ${userId}</div>
            <div class="chat-messages" id="messages">
        `;
        
        messages.forEach(msg => {
            const type = msg.type === 'user' ? 'user' : 'admin';
            html += `
            <div class="message ${type}">
                <div class="bubble">${escapeHtml(msg.content)}</div>
            </div>
            `;
        });
        
        html += `
            </div>
            <div class="input-area">
                <input type="text" id="msgInput" placeholder="输入回复..." autocomplete="off">
                <button onclick="sendReply()">发送</button>
            </div>
            <script>
                const userId = "${userId}";
                let lastMsgId = ${messages.length > 0 ? messages[messages.length-1].id : 0};
                
                function addMessage(content, type) {
                    const container = document.getElementById('messages');
                    const div = document.createElement('div');
                    div.className = \`message \${type}\`;
                    const bubble = document.createElement('div');
                    bubble.className = 'bubble';
                    bubble.innerHTML = content;
                    div.appendChild(bubble);
                    container.appendChild(div);
                    container.scrollTop = container.scrollHeight;
                }
                
                async function sendReply() {
                    const input = document.getElementById('msgInput');
                    const content = input.value.trim();
                    if (!content) return;
                    
                    addMessage(content, 'admin');
                    input.value = '';
                    
                    await fetch('/api/admin/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, content, type: 'admin' })
                    });
                }
                
                async function pollNewMessages() {
                    const res = await fetch(\`/api/admin/new-messages?userId=\${userId}&lastId=\${lastMsgId}\`);
                    const newMsgs = await res.json();
                    if (newMsgs.length > 0) {
                        newMsgs.forEach(msg => {
                            if (msg.type === 'user') {
                                addMessage(msg.content, 'user');
                            }
                            lastMsgId = msg.id;
                        });
                    }
                }
                
                setInterval(pollNewMessages, 2000);
            </script>
        </body>
        </html>
        `;
        
        res.send(html);
    });
});

// 管理员发送回复
app.post('/api/admin/send', (req, res) => {
    const { userId, content, type } = req.body;
    db.run('INSERT INTO messages (userId, content, type) VALUES (?, ?, ?)', [userId, content, type], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// 管理员轮询新消息
app.get('/api/admin/new-messages', (req, res) => {
    const { userId, lastId } = req.query;
    db.all('SELECT * FROM messages WHERE userId = ? AND id > ? ORDER BY id ASC', [userId, lastId || 0], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
    console.log(`管理员后台: http://localhost:${port}/admin`);
});