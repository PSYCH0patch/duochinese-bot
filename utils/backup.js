const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../database/duochinese.db');
const backupDir = '/root/backups/duochinese';

if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

// Format nama file: backup_2023-10-25T12-30-00.db
const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `backup_${dateStr}.db`);

try {
  const db = new Database(dbPath);
  console.log(`⏳ Memulai backup database...`);
  
  db.backup(backupPath)
    .then(() => {
      console.log(`✅ Backup berhasil: ${backupPath}`);
      
      // Bersihkan backup lama (Simpan 10 backup terakhir saja)
      const files = fs.readdirSync(backupDir).filter(f => f.startsWith('backup_')).sort().reverse();
      if (files.length > 10) {
        for (let i = 10; i < files.length; i++) {
          fs.unlinkSync(path.join(backupDir, files[i]));
          console.log(`🧹 Menghapus backup usang: ${files[i]}`);
        }
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Backup gagal:', err);
      process.exit(1);
    });
} catch (error) {
  console.error('❌ Gagal membuka DB:', error);
  process.exit(1);
}
