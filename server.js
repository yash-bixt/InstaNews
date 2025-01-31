import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { YoutubeTranscript } from "youtube-transcript";
import path from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static frontend files
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "public")));

// Use API key from .env
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Error: Missing Gemini API Key. Check your .env file.");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(API_KEY);

// Function to extract transcript from YouTube URL
async function getTranscript(videoUrl) {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoUrl);
    return transcript.map((entry) => entry.text).join(" ");
  } catch (error) {
    console.error("Error fetching transcript:", error);
    return null;
  }
}

// Function to generate newsletter using Gemini API
async function generateNewsletter(transcript) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
      Here is a YouTube video transcript:
      "${transcript}"

      Please generate a professional and engaging newsletter summarizing the key points. 
      Include title, brief description, and a call to action.
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Error generating newsletter:", error);
    return null;
  }
}

// API Endpoint to process YouTube URL
app.post("/generate-newsletter", async (req, res) => {
  const { videoUrl } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ error: "Missing video URL" });
  }

  console.log("Fetching transcript...");
  const transcript = await getTranscript(videoUrl);

  if (!transcript) {
    return res.status(500).json({ error: "Could not fetch transcript" });
  }

  console.log("Generating newsletter...");
  const newsletter = await generateNewsletter(transcript);

  if (!newsletter) {
    return res.status(500).json({ error: "Failed to generate newsletter" });
  }

  res.json({ newsletter });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
