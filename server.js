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

    const res = await fetch(GITHUB_API_URL + path, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${GITHUB_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: "Upload image",
            content: encodedContent
        })
    });

    if (!res.ok) {
        console.log(await res.text());
    }
}

// Obtener datos del usuario
async function getUserData(email) {
    const url = GITHUB_API_URL + `data/users/${email}.json`;

    const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${GITHUB_TOKEN}` }
    });

    if (!res.ok) return { favoritos: [], historial: [] };

    const data = await res.json();
    return JSON.parse(Buffer.from(data.content, "base64").toString());
}

// Guardar datos usuario
async function saveUserData(email, data) {
    await saveToGitHub(`data/users/${email}.json`, JSON.stringify(data));
}

// ======================== ENDPOINTS ========================

// Subir imagen
app.post("/api/upload", async (req, res) => {
    const { base64, description } = req.body;

    if (!base64 || !description)
        return res.status(400).json({ message: "Faltan datos" });

    const id = uuidv4();
    const payload = { id, base64, description };

    await saveToGitHub(`public/images/${id}.json`, JSON.stringify(payload));

    res.json({ message: "Imagen guardada correctamente", id });
});

// Obtener todas las imágenes
app.get("/api/images", async (req, res) => {
    try {
        const listRes = await fetch(GITHUB_API_URL + "public/images", {
            headers: { "Authorization": `Bearer ${GITHUB_TOKEN}` }
        });

        const files = await listRes.json();
        if (!Array.isArray(files)) return res.json([]);

        const images = [];

        for (const file of files) {
            if (!file.url.endsWith(".json")) continue;

            const jsonRes = await fetch(file.url, {
                headers: { "Authorization": `Bearer ${GITHUB_TOKEN}` }
            });

            const jsonData = await jsonRes.json();
            const decoded = JSON.parse(Buffer.from(jsonData.content, "base64").toString());

            images.push({
                id: decoded.id,
                description: decoded.description,
                imageUrl: `data:image/jpeg;base64,${decoded.base64}`
            });
        }

        res.json(images);
    } catch (err) {
        console.log("ERROR:", err.message);
        res.json([]);
    }
});

// Favoritos
app.post("/api/:email/favoritos", async (req, res) => {
    const email = req.params.email;
    const { id } = req.body;

    const user = await getUserData(email);
    if (!user.favoritos.includes(id)) user.favoritos.push(id);

    await saveUserData(email, user);

    res.json({ message: "Favorito agregado", favoritos: user.favoritos });
});

// Obtener favoritos
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

// Mostrar historial
app.get("/api/:email/historial", async (req, res) => {
    const email = req.params.email;
    const user = await getUserData(email);

    res.json(user.historial);
});

// Estadísticas
app.get("/api/:email/estadisticas", async (req, res) => {
    const email = req.params.email;
    const user = await getUserData(email);

    res.json({
        totalFavoritos: user.favoritos.length,
        totalHistorial: user.historial.length
    });
});

// ============================================================

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
    console.log(`Servidor en puerto ${PORT} | Base URL: ${API_BASE_URL}`)
);
