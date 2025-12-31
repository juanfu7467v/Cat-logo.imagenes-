import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
// Aumentamos el límite para soportar múltiples base64 en un solo JSON
app.use(express.json({ limit: "100mb" }));

// Variables de entorno
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const IMAGES_FILE_PATH = "public/images/all_images.json";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/`;

// --- FUNCIONES AUXILIARES DE GITHUB ---

async function getFileFromGitHub(path) {
    const res = await fetch(GITHUB_API_URL + path, {
        headers: { "Authorization": `Bearer ${GITHUB_TOKEN}` }
    });

    if (!res.ok) return null;

    const data = await res.json();
    return {
        sha: data.sha,
        content: JSON.parse(Buffer.from(data.content, "base64").toString())
    };
}

async function saveToGitHub(path, content, sha = null) {
    const encodedContent = Buffer.from(JSON.stringify(content, null, 2)).toString("base64");

    const body = {
        message: "Update images database",
        content: encodedContent
    };

    if (sha) body.sha = sha; // Necesario para actualizar archivos existentes

    const res = await fetch(GITHUB_API_URL + path, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${GITHUB_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    return res.ok;
}

// Obtener datos del usuario
async function getUserData(email) {
    const data = await getFileFromGitHub(`data/users/${email}.json`);
    return data ? data.content : { favoritos: [], historial: [] };
}

// Guardar datos usuario
async function saveUserData(email, data) {
    const existingFile = await getFileFromGitHub(`data/users/${email}.json`);
    await saveToGitHub(`data/users/${email}.json`, data, existingFile?.sha);
}

// ======================== ENDPOINTS ========================

// 1. Subir imagen (Agrega a un solo archivo JSON)
app.post("/api/upload", async (req, res) => {
    const { base64, description } = req.body;

    if (!base64 || !description)
        return res.status(400).json({ message: "Faltan datos" });

    try {
        // 1. Intentar obtener el archivo actual de imágenes
        const existingData = await getFileFromGitHub(IMAGES_FILE_PATH);
        
        const imagesList = existingData ? existingData.content : [];
        const sha = existingData ? existingData.sha : null;

        // 2. Crear nueva entrada
        const newImage = {
            id: uuidv4(),
            description,
            base64, // Guardamos el base64 directamente
            timestamp: new Date().toISOString()
        };

        // 3. Añadir al array
        imagesList.push(newImage);

        // 4. Guardar de nuevo en GitHub
        const success = await saveToGitHub(IMAGES_FILE_PATH, imagesList, sha);

        if (success) {
            res.json({ message: "Imagen guardada en archivo central", id: newImage.id });
        } else {
            res.status(500).json({ message: "Error al guardar en GitHub" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno" });
    }
});

// 2. Obtener todas las imágenes (Carga rápida desde un solo archivo)
app.get("/api/images", async (req, res) => {
    try {
        const data = await getFileFromGitHub(IMAGES_FILE_PATH);
        if (!data) return res.json([]);
        
        // Mapeamos para asegurar que el formato sea el esperado por el frontend
        const images = data.content.map(img => ({
            id: img.id,
            description: img.description,
            imageUrl: img.base64.includes("base64,") ? img.base64 : `data:image/jpeg;base64,${img.base64}`
        }));

        res.json(images);
    } catch (err) {
        console.log("ERROR:", err.message);
        res.json([]);
    }
});

// --- FAVORITOS Y HISTORIAL ---

app.post("/api/:email/favoritos", async (req, res) => {
    const email = req.params.email;
    const { id } = req.body;
    const user = await getUserData(email);
    if (!user.favoritos.includes(id)) user.favoritos.push(id);
    await saveUserData(email, user);
    res.json({ message: "Favorito agregado", favoritos: user.favoritos });
});

app.get("/api/:email/favoritos", async (req, res) => {
    const user = await getUserData(req.params.email);
    res.json(user.favoritos);
});

app.post("/api/:email/historial", async (req, res) => {
    const email = req.params.email;
    const { id } = req.body;
    const user = await getUserData(email);
    user.historial.push(id);
    await saveUserData(email, user);
    res.json({ message: "Historial actualizado" });
});

app.get("/api/:email/historial", async (req, res) => {
    const user = await getUserData(req.params.email);
    res.json(user.historial);
});

app.get("/api/:email/estadisticas", async (req, res) => {
    const user = await getUserData(req.params.email);
    res.json({
        totalFavoritos: user.favoritos.length,
        totalHistorial: user.historial.length
    });
});

// ============================================================

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
    console.log(`Servidor corriendo en puerto ${PORT}`)
);
