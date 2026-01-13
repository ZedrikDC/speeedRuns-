const express = require('express');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de SQL Server
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    instancename: 'SQLEXPRESS'
  }
};

// Conectar a la BD
sql.connect(config).then(() => {
  console.log('✅ Conectado a SQL Server');
}).catch(err => console.error('❌ Error de conexión:', err));

// ==================== ENDPOINTS PÚBLICOS ====================

// 1. Obtener juegos (Vista)
app.get('/api/games', async (req, res) => {
  try {
    const result = await sql.query`SELECT * FROM vw_GamesWithPlatforms ORDER BY TotalSpeedruns DESC`;
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Obtener Ranking de un juego (Stored Procedure)
app.get('/api/rankings/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { categoryId, platform } = req.query;

    const request = new sql.Request();
    request.input('GameID', sql.Int, gameId);
    if (categoryId && categoryId !== 'Todas') request.input('CategoryID', sql.Int, categoryId);
    if (platform && platform !== 'Todas') request.input('PlatformFilter', sql.NVarChar(50), platform);

    const result = await request.execute('sp_GetGameRanking');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Obtener Speedruns del Usuario (Perfil)
app.get('/api/speedruns/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    // IMPORTANTE: Aseguramos que SpeedrunID venga en el select
    const result = await sql.query`
      SELECT 
        s.SpeedrunID,
        g.Title AS game,
        c.CategoryName AS category,
        CONCAT(
          CASE WHEN s.TimeHours > 0 THEN CONCAT(s.TimeHours, ':') ELSE '' END,
          RIGHT('0' + CAST(s.TimeMinutes AS VARCHAR), 2), ':',
          RIGHT('0' + CAST(s.TimeSeconds AS VARCHAR), 2), '.',
          RIGHT('00' + CAST(s.TimeMilliseconds AS VARCHAR), 3)
        ) AS time,
        s.VideoURL AS videoURL,       
        FORMAT(s.CreatedAt, 'dd/MM/yyyy') AS date,
        ISNULL(s.Status, 'Pending') AS Status
      FROM Speedruns s
      INNER JOIN Games g ON s.GameID = g.GameID
      INNER JOIN Categories c ON s.CategoryID = c.CategoryID
      WHERE s.UserID = ${userId}
      ORDER BY s.CreatedAt DESC
    `;
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. Subir Speedrun
app.post('/api/speedruns', async (req, res) => {
  try {
    const { userID, gameID, categoryID, timeHours, timeMinutes, timeSeconds, timeMilliseconds, videoURL, platformID } = req.body;
    const request = new sql.Request();
    request.input('UserID', sql.Int, userID)
      .input('GameID', sql.Int, gameID)
      .input('CategoryID', sql.Int, categoryID)
      .input('TimeHours', sql.Int, timeHours)
      .input('TimeMinutes', sql.Int, timeMinutes)
      .input('TimeSeconds', sql.Int, timeSeconds)
      .input('TimeMilliseconds', sql.Int, timeMilliseconds)
      .input('VideoURL', sql.NVarChar(500), videoURL)
      .input('PlatformID', sql.Int, platformID);

    await request.execute('sp_InsertSpeedrun');
    res.json({ message: 'Speedrun subido exitosamente' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== ENDPOINTS DE ADMIN ====================

// 5. Actualizar Estado (Verificar / Rechazar)
app.put('/api/speedruns/:id/status', async (req, res) => {

  // --- AGREGA ESTAS LÍNEAS AL INICIO DE LA RUTA ---
  console.log('------------------------------------------------');
  console.log('📢 PETICIÓN RECIBIDA EN EL SERVIDOR');
  console.log('ID recibido:', req.params.id);
  console.log('Datos recibidos (body):', req.body);
  // ------------------------------------------------
  try {
    const { id } = req.params;
    const { status } = req.body; // Espera 'Verified', 'Rejected', o 'Pending'

    const runId = parseInt(id);

    // Validación básica
    if (isNaN(runId)) {
      console.error('❌ ID inválido recibido:', id);
      return res.status(400).json({ error: 'ID de speedrun inválido' });
    }

    console.log(`🔄 Intentando actualizar Run ID: ${runId} a estado: ${status}`);

    const request = new sql.Request();
    // IMPORTANTE: Definir tamaño de NVarChar para evitar truncamientos o errores de tipo
    request.input('Status', sql.NVarChar(20), status);
    request.input('ID', sql.Int, runId);

    // Ejecutar Query directa
    const result = await request.query('UPDATE Speedruns SET Status = @Status WHERE SpeedrunID = @ID');

    // Verificar si se actualizó algo
    if (result.rowsAffected[0] === 0) {
      console.warn(`⚠️ No se encontró el Speedrun ID: ${runId} para actualizar.`);
      return res.status(404).json({ error: 'Speedrun no encontrado' });
    }

    console.log(`✅ Speedrun ${runId} actualizado correctamente a ${status}`);
    res.json({ message: `Estado actualizado a ${status}` });

  } catch (err) {
    console.error("❌ ERROR CRÍTICO EN UPDATE:", err);
    res.status(500).json({ error: err.message, details: err });
  }
});

// 6. Eliminar Speedrun
app.delete('/api/speedruns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const runId = parseInt(id);

    if (isNaN(runId)) return res.status(400).json({ error: 'ID inválido' });

    // 1. Obtener datos antes de borrar
    const checkReq = new sql.Request();
    checkReq.input('ID', sql.Int, runId);
    const runData = await checkReq.query('SELECT GameID, UserID FROM Speedruns WHERE SpeedrunID = @ID');

    if (runData.recordset.length > 0) {
      const { GameID, UserID } = runData.recordset[0];

      // 2. Borrar Run
      const delReq = new sql.Request();
      delReq.input('ID', sql.Int, runId);
      await delReq.query('DELETE FROM Speedruns WHERE SpeedrunID = @ID');

      // 3. Restar contadores
      await sql.query`UPDATE Games SET TotalSpeedruns = TotalSpeedruns - 1 WHERE GameID = ${GameID}`;
      await sql.query`UPDATE Users SET TotalRuns = TotalRuns - 1 WHERE UserID = ${UserID}`;

      res.json({ message: 'Speedrun eliminado' });
    } else {
      res.status(404).json({ message: 'Speedrun no encontrado' });
    }

  } catch (err) {
    console.error("Error al eliminar:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Upsert Usuario
app.post('/api/users/upsert', async (req, res) => {
  try {
    const { email, username, avatar, isAdmin } = req.body;
    const request = new sql.Request();
    request.input('Email', sql.NVarChar(255), email)
      .input('Username', sql.NVarChar(100), username)
      .input('Avatar', sql.NVarChar(500), avatar)
      .input('IsAdmin', sql.Bit, isAdmin);
    const result = await request.execute('sp_UpsertUser');
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 8. Utilidades
app.get('/api/categories', async (req, res) => {
  const result = await sql.query`SELECT * FROM Categories`;
  res.json(result.recordset);
});
app.get('/api/platforms', async (req, res) => {
  const result = await sql.query`SELECT * FROM Platforms`;
  res.json(result.recordset);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
