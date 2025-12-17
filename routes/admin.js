const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

// Admin login endpoint
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Database'den admin kullanıcıyı bul
        const [users] = await req.db.execute(
            'SELECT * FROM admin_users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
        }

        const user = users[0];

        // Şifreyi kontrol et
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'Geçersiz şifre' });
        }

        // Başarılı giriş
        res.json({
            success: true,
            message: 'Giriş başarılı',
            user: { id: user.id, username: user.username }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

module.exports = router;
