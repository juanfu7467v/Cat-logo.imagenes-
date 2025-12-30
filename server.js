import express from "express";
import cors from "cors";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

const USERS_FILE = "./data/users.json";

// ===== UTILIDADES =====
function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) return {};
    return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// ===== ENDPOINTS =====

// Subir imagen en Base64
app.post("/api/upload", (req, res) => {
    const { base64, description } = req.body;

    if (!base64 || !description) {
        return res.status(400).json({ message: "Faltan datos" });
    }

    const id = uuidv4();
    const filePath = `public/images/${id}.txt`;

    fs.writeFileSync(filePath, JSON.stringify({ id, base64, description }));

    res.json({ message: "Imagen guardada", id });
});

// Obtener TODAS las imágenes
app.get("/api/images", (req, res) => {
    const files = fs.readdirSync("public/images");
    const images = files.map(file => {
        const data = JSON.parse(fs.readFileSync(`public/images/${file}`));
        return data;
    });
    res.json(images);
});

// Agregar a favoritos por usuario
app.post("/api/:email/favoritos", (req, res) => {
    const email = req.params.email;
    const { id } = req.body;

    const users = loadUsers();
    if (!users[email]) users[email] = { favoritos: [], historial: [], estadisticas: {} };

    if (!users[email].favoritos.includes(id)) {
        users[email].favoritos.push(id);
        saveUsers(users);
    }

    res.json({ message: "Agregado a favoritos", favoritos: users[email].favoritos });
});

// Obtener favoritos
app.get("/api/:email/favoritos", (req, res) => {
    const email = req.params.email;
    const users = loadUsers();

    if (!users[email]) return res.json([]);

    res.json(users[email].favoritos);
});

// Guardar historial
app.post("/api/:email/historial", (req, res) => {
    const email = req.params.email;
    const { id } = req.body;

    const users = loadUsers();
    if (!users[email]) users[email] = { favoritos: [], historial: [], estadisticas: {} };

    users[email].historial.push(id);
    saveUsers(users);

    res.json({ message: "Historial actualizado" });
});

// Obtener historial
app.get("/api/:email/historial", (req, res) => {
    const email = req.params.email;
    const users = loadUsers();

    res.json(users[email]?.historial || []);
});

// Estadísticas por usuario
app.get("/api/:email/estadisticas", (req, res) => {
    const email = req.params.email;
    const users = loadUsers();

    const user = users[email] || { favoritos: [], historial: [] };

    res.json({
        totalFavoritos: user.favoritos.length,
        totalHistorial: user.historial.length
    });
});

// Inicializar servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
