async function convert() {
    const videoUrl = document.getElementById("videoUrl").value;
    if (!videoUrl) {
        alert("Please enter a YouTube video URL");
        return;
    }

    document.getElementById("newsletter").innerHTML = "Processing...";

    try {
        const response = await axios.post("http://localhost:5000/generate-newsletter", { videoUrl });
        document.getElementById("newsletter").innerHTML = `<h2>Generated Newsletter:</h2><p>${response.data.newsletter}</p>`;
    } catch (error) {
        console.error("Error:", error);
        document.getElementById("newsletter").innerHTML = "Error processing request.";
    }
}