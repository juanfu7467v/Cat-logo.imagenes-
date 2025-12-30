import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Variables de entorno
const API_BASE_URL = process.env.API_BASE_URL;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/`;

// Guardar archivo en GitHub
async function saveToGitHub(path, content) {
    const encodedContent = Buffer.from(content).toString("base64");

    await fetch(GITHUB_API_URL + path, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${GITHUB_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            message: "Update file",
            content: encodedContent
        })
    });
}

// Obtener historial del usuario
async function getUserData(email) {
    const url = GITHUB_API_URL + `data/users/${email}.json`;
    const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${GITHUB_TOKEN}` }
    });

    if (!res.ok) return { favoritos: [], historial: [] };

    const data = await res.json();
    return JSON.parse(Buffer.from(data.content, "base64").toString());
}

// Guardar historial del usuario
async function saveUserData(email, data) {
    await saveToGitHub(`data/users/${email}.json`, JSON.stringify(data));
}

// ==================== ENDPOINTS =====================

// Subir imagen base64 a GitHub
app.post("/api/upload", async (req, res) => {
    const { base64, description } = req.body;

    if (!base64 || !description)
        return res.status(400).json({ message: "Faltan datos" });

    const id = uuidv4();
    const imageData = { id, base64, description };

    await saveToGitHub(`public/images/${id}.json`, JSON.stringify(imageData));

    res.json({ message: "Imagen guardada", id });
});

// Obtener TODAS las imágenes desde GitHub
app.get("/api/images", async (req, res) => {
    const listReq = await fetch(GITHUB_API_URL + "public/images", {
        headers: { "Authorization": `Bearer ${GITHUB_TOKEN}` }
    });

    const list = await listReq.json();
    if (!Array.isArray(list)) return res.json([]);

    const results = [];
    for (let item of list) {
        const imgReq = await fetch(item.download_url);
        results.push(await imgReq.json());
    }

    res.json(results);
});

// Favoritos por usuario
app.post("/api/:email/favoritos", async (req, res) => {
    const email = req.params.email;
    const { id } = req.body;

    const user = await getUserData(email);
    if (!user.favoritos.includes(id)) user.favoritos.push(id);

    await saveUserData(email, user);

    res.json({ message: "Agregado a favoritos", favoritos: user.favoritos });
});

app.get("/api/:email/favoritos", async (req, res) => {
    const email = req.params.email;
    const user = await getUserData(email);

    res.json(user.favoritos);
});

// Historial
app.post("/api/:email/historial", async (req, res) => {
    const email = req.params.email;
    const { id } = req.body;

    const user = await getUserData(email);
    user.historial.push(id);

    await saveUserData(email, user);

    res.json({ message: "Historial actualizado" });
});

app.get("/api/:email/historial", async (req, res) => {
    const email = req.params.email;
    const user = await getUserData(email);

    res.json(user.historial);
});

// Estadísticas usuario
app.get("/api/:email/estadisticas", async (req, res) => {
    const email = req.params.email;
    const user = await getUserData(email);

    res.json({
        totalFavoritos: user.favoritos.length,
        totalHistorial: user.historial.length
    });
});

// Servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
    console.log(`Servidor listo en puerto ${PORT} | Base: ${API_BASE_URL}`)
);
