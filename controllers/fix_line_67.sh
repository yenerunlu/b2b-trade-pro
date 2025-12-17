#!/bin/bash
# Satır 67'yi düzelt
sed -i '67c\            console.log(\"📋 SQL çalıştırılıyor:\", query.substring(0, 100) + \"...\");' b2bAdminController.js
sed -i '68c\            const result = await pool.request().query(query);' b2bAdminController.js
sed -i '69c\            console.log(\"✅ SQL başarılı, kayıt sayısı:\", result.recordset.length);' b2bAdminController.js
