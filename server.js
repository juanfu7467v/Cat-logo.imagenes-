import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json({ limit: "100mb" }));

// Variables de entorno
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const IMAGES_FILE_PATH = "public/images/all_images.json";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/`;

// --- FUNCIONES AUXILIARES DE GITHUB ---

async function getFileFromGitHub(path) {
    // Añadimos un parámetro 't' aleatorio para evitar el caché de GitHub
    const cacheBuster = `?t=${Date.now()}`;
    const res = await fetch(GITHUB_API_URL + path + cacheBuster, {
        headers: { 
            "Authorization": `Bearer ${GITHUB_TOKEN}`,
            "Accept": "application/vnd.github.v3+json"
        }
    });

    if (!res.ok) {
        console.log(`Archivo no encontrado o error en: ${path}`);
        return null;
    }

    const data = await res.json();
    
    // Decodificar contenido Base64 de GitHub a String y luego a JSON
    const contentString = Buffer.from(data.content, "base64").toString("utf-8");
    
    return {
        sha: data.sha,
        content: JSON.parse(contentString)
    };
}

async function saveToGitHub(path, content, sha = null) {
    const encodedContent = Buffer.from(JSON.stringify(content, null, 2)).toString("base64");

    const body = {
        message: `Update database: ${new Date().toISOString()}`,
        content: encodedContent
    };

    if (sha) body.sha = sha;

    const res = await fetch(GITHUB_API_URL + path, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${GITHUB_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error("Error al guardar en GitHub:", errorText);
    }

    return res.ok;
}

// Auxiliares para usuario
async function getUserData(email) {
    const data = await getFileFromGitHub(`data/users/${email}.json`);
    return data ? data.content : { favoritos: [], historial: [] };
}

async function saveUserData(email, data) {
    const existingFile = await getFileFromGitHub(`data/users/${email}.json`);
    await saveToGitHub(`data/users/${email}.json`, data, existingFile?.sha);
}

// ======================== ENDPOINTS ========================

// 1. Subir imagen (Escribe en el archivo único)
app.post("/api/upload", async (req, res) => {
    const { base64, description } = req.body;

    if (!base64 || !description)
        return res.status(400).json({ message: "Faltan datos" });

    try {
        const existingData = await getFileFromGitHub(IMAGES_FILE_PATH);
        
        let imagesList = [];
        let sha = null;

        if (existingData) {
            imagesList = Array.isArray(existingData.content) ? existingData.content : [];
            sha = existingData.sha;
        }

        const newImage = {
            id: uuidv4(),
            description,
            base64, 
            timestamp: new Date().toISOString()
        };

        imagesList.push(newImage);

        const success = await saveToGitHub(IMAGES_FILE_PATH, imagesList, sha);

        if (success) {
            res.json({ message: "Imagen guardada correctamente", id: newImage.id });
        } else {
            res.status(500).json({ message: "No se pudo actualizar el archivo en GitHub" });
        }
    } catch (error) {
        console.error("Error en upload:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

// 2. Obtener todas las imágenes (Lee el archivo único)
app.get("/api/images", async (req, res) => {
    try {
        const data = await getFileFromGitHub(IMAGES_FILE_PATH);
        
        if (!data || !data.content) {
            console.log("El archivo no existe o está vacío.");
            return res.json([]);
        }
        
        const images = data.content.map(img => ({
            id: img.id,
            description: img.description,
            imageUrl: img.base64.startsWith("data:") ? img.base64 : `data:image/jpeg;base64,${img.base64}`
        }));

        res.json(images.reverse()); // Reverse para mostrar las más nuevas primero
    } catch (err) {
        console.error("Error en get images:", err.message);
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
    console.log(`Servidor listo en puerto ${PORT}`)
);
