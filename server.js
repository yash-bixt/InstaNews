import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { YoutubeTranscript } from "youtube-transcript";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import * as cheerio from "cheerio";
import nodemailer from "nodemailer";
import puppeteer from 'puppeteer';
import os from "os";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
const __dirname = path.resolve();

// Serve static files with index.html as default
app.use(express.static(path.join(__dirname, "public")));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add CORS headers middleware for images
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// API Configuration
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Error: Missing Gemini API Key. Check your .env file.");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(API_KEY);

// Update Email configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Add verification
transporter.verify(function (error, success) {
  if (error) {
    console.log("Email verification error:", error);
  } else {
    console.log("Email server is ready to take our messages");
  }
});

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

    const prompt = 
      `Here is a YouTube video transcript:
      "${transcript}"

      Please generate a professional and engaging newsletter summary in the following format exactly:

      **Title:** [Create an engaging title for the video content]
      
      **Description:** [Write a compelling 2-3 sentence description of the video's main topic]
      
      **Key Findings:** 
      * [Key point 1]
      * [Key point 2]
      * [Key point 3]
      
      **Implications for Real-World Scenarios:**
      * [Implication 1]
      * [Implication 2]
      
      **Call to Action:**
      [Write a brief call to action encouraging viewers to watch the full video]`;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Error generating newsletter:", error);
    return null;
  }
}

// Function to generate Instagram post using Gemini API
async function generateInstaPost(transcript) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
      Create an engaging Instagram post from this video transcript:
      "${transcript}"

      Format the response exactly as follows:
      
      **Title:** [Catchy 5-7 word title]
      
      **Description:** [2-3 compelling sentences, Instagram-style]
      
      **Key Points:**
      * [Point 1]
      * [Point 2]
      * [Point 3]
      
      **Hashtags:**
      [5-7 relevant hashtags]
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Error generating Instagram post:", error);
    return null;
  }
}

// Function to send newsletter via email
async function sendNewsletterEmail(email, newsletterData) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Newsletter: ${newsletterData.title}`,
      html: `
        <html>
          <body>
            <h1>${newsletterData.title}</h1>
            <p><strong>Description:</strong> ${newsletterData.description}</p>
            
            <h2>Key Findings:</h2>
            <ul>
              ${newsletterData.keyFindings.map(finding => `<li>${finding}</li>`).join('')}
            </ul>
            
            <h2>Implications:</h2>
            <ul>
              ${newsletterData.implications.map(implication => `<li>${implication}</li>`).join('')}
            </ul>
            
            <div>
              <strong>Call to Action:</strong>
              <p>${newsletterData.callToAction}</p>
            </div>
          </body>
        </html>`,
      attachments: [
        {
          filename: 'thumbnail.jpg',
          path: newsletterData.thumbnailUrl
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// Function to get thumbnail URL for YouTube video
async function getThumbnailUrl(videoUrl) {
  try {
    const videoId = videoUrl.split("v=")[1].split("&")[0];
    // Use larger resolution thumbnail
    const thumbnailOptions = [
      `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
    ];

    // Try each thumbnail option until one works
    for (const url of thumbnailOptions) {
      try {
        const response = await axios.head(url);
        if (response.status === 200) {
          return url;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Return default if none work
    return thumbnailOptions[1];
  } catch (error) {
    console.error("Error fetching thumbnail:", error);
    return null;
  }
}

// API routes without authentication
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
  const generatedText = await generateNewsletter(transcript);

  if (!generatedText) {
    return res.status(500).json({ error: "Failed to generate newsletter" });
  }

  console.log("Fetching thumbnail...");
  const thumbnailUrl = await getThumbnailUrl(videoUrl);

  res.json({
    generatedText,
    thumbnailUrl,
    videoUrl
  });
});

app.post("/send-newsletter", async (req, res) => {
  const { videoUrl, clientEmail } = req.body;

  if (!videoUrl || !clientEmail) {
    return res.status(400).json({ error: "Missing video URL or email" });
  }

  try {
    const transcript = await getTranscript(videoUrl);
    if (!transcript) {
      return res.status(500).json({ error: "Could not fetch transcript" });
    }

    const generatedText = await generateNewsletter(transcript);
    if (!generatedText) {
      return res.status(500).json({ error: "Failed to generate newsletter" });
    }

    const parsedContent = {
      title: (generatedText.match(/\*\*Title:\*\*([\s\S]*?)(?=\*\*|$)/) || [])[1]?.trim() || 'Newsletter',
      description: (generatedText.match(/\*\*Description:\*\*([\s\S]*?)(?=\*\*|$)/) || [])[1]?.trim() || '',
      keyFindings: (generatedText.match(/\*\*Key Findings:\*\*([\s\S]*?)(?=\*\*|$)/) || [])[1]?.trim().split('*').filter(f => f.trim()).map(f => f.trim()) || [],
      implications: (generatedText.match(/\*\*Implications for Real-World Scenarios:\*\*([\s\S]*?)(?=\*\*|$)/) || [])[1]?.trim().split('*').filter(f => f.trim()).map(f => f.trim()) || [],
      callToAction: (generatedText.match(/\*\*Call to Action:\*\*([\s\S]*?)$/)?.[1])?.trim() || ''
    };

    const thumbnailUrl = await getThumbnailUrl(videoUrl);

    const emailSent = await sendNewsletterEmail(clientEmail, {
      ...parsedContent,
      thumbnailUrl
    });

    if (emailSent) {
      res.json({ message: "Newsletter sent successfully" });
    } else {
      res.status(500).json({ error: "Failed to send newsletter" });
    }

  } catch (error) {
    console.error('Error in send-newsletter endpoint:', error);
    res.status(500).json({ error: "An unexpected error occurred" });
  }
});

// Add new API endpoint for Instagram post generation
app.post("/generate-instapost", async (req, res) => {
  const { videoUrl } = req.body;
  
  if (!videoUrl) {
    return res.status(400).json({ error: "Missing video URL" });
  }

  try {
    const transcript = await getTranscript(videoUrl);
    if (!transcript) {
      return res.status(500).json({ error: "Could not fetch transcript" });
    }

    const generatedText = await generateInstaPost(transcript);
    if (!generatedText) {
      return res.status(500).json({ error: "Failed to generate Instagram post" });
    }

    const thumbnailUrl = await getThumbnailUrl(videoUrl);

    // Parse the generated content
    const parsedContent = {
      title: (generatedText.match(/\*\*Title:\*\*([\s\S]*?)(?=\*\*|$)/) || [])[1]?.trim(),
      description: (generatedText.match(/\*\*Description:\*\*([\s\S]*?)(?=\*\*|$)/) || [])[1]?.trim(),
      keyPoints: (generatedText.match(/\*\*Key Points:\*\*([\s\S]*?)(?=\*\*|$)/) || [])[1]?.trim()
        .split('*')
        .filter(point => point.trim()),
      hashtags: (generatedText.match(/\*\*Hashtags:\*\*([\s\S]*?)(?=\*\*|$)/) || [])[1]?.trim()
    };

    res.json({
      ...parsedContent,
      thumbnailUrl
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An unexpected error occurred" });
  }
});

// Start server, listen on all network interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Log network-accessible addresses
  const nets = os.networkInterfaces();
  for (const name in nets) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`Accessible on: http://${net.address}:${PORT}`);
      }
    }
  }
});