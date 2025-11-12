require('dotenv').config();

const mysql = require('mysql2/promise');

const DB_NAME = 'approvaldb';
let pool;

function getPool() {
  if (!pool) {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;

    if (!DB_HOST || !DB_USER || !DB_PASSWORD) {
      throw new Error('Database credentials are not fully configured.');
    }

    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT ? Number(DB_PORT) : 3306,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  return pool;
}

module.exports = {
  getPool,
};
