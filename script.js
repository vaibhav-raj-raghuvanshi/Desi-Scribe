document.addEventListener("DOMContentLoaded", () => {

    const API_BASE_URL = "http://127.0.0.1:5001";

    // --- 1. DOM ELEMENTS ---
    const describeBtn = document.getElementById("desiDescribeBtn");
    const chatModal = document.getElementById("chatModal");
    const closeChatBtn = document.getElementById("closeChat");
    const chatMessages = document.getElementById("chatMessages");

    // Dynamic Elements (Re-bindable)
    let startOptions = document.getElementById("startOptions");
    let languageSelect = document.getElementById("languageSelect");

    // UI Sections
    const inputForm = document.getElementById("inputForm");
    const fileInput = document.getElementById("imageUploadInput");

    // Inputs
    const businessInput = document.getElementById("businessType");
    const adTypeInput = document.getElementById("adType");
    const productDescInput = document.getElementById("productDesc");

    // Action Buttons
    const sloganBtn = document.getElementById("generateSloganBtn");
    const posterBtn = document.getElementById("generatePosterBtn");

    // --- 2. MODE SWITCHING LOGIC ---

    window.startManual = function () {
        // Re-grab elements just in case DOM reset happened
        startOptions = document.getElementById("startOptions");
        languageSelect = document.getElementById("languageSelect");

        const lang = languageSelect ? languageSelect.value : "English";

        startOptions.style.display = "none";
        inputForm.style.display = "flex";

        addMessage(`✍️ Manual Mode selected (${lang}).`, "user");
        addMessage("Okay! Fill in the form below.", "bot");
    };

    window.startUpload = function () {
        fileInput.click();
    };

    // --- 3. HANDLE FILE UPLOAD (VISION API) ---
    if (fileInput) {
        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Update UI
            startOptions = document.getElementById("startOptions");
            startOptions.style.display = "none";

            addMessage("📸 Uploading image...", "user");
            addMessage("Analyzing image details... 🧠", "bot");

            const formData = new FormData();
            formData.append("file", file);

            try {
                const res = await fetch(`${API_BASE_URL}/analyze-image`, {
                    method: "POST",
                    body: formData
                });
                const result = await res.json();

                if (result.status === "success") {
                    // Auto-fill form
                    businessInput.value = result.business_type;
                    productDescInput.value = result.description;

                    inputForm.style.display = "flex";
                    addMessage(`I see: "${result.description}".`, "bot");

                    // Mention the selected language
                    const lang = document.getElementById("languageSelect").value;
                    addMessage(`Form auto-filled! Ready to generate in ${lang}?`, "bot");
                } else {
                    addMessage("❌ Analysis failed: " + result.error, "bot");
                    inputForm.style.display = "flex";
                }
            } catch (err) {
                console.error(err);
                addMessage("❌ Network Error.", "bot");
                inputForm.style.display = "flex";
            }
        });
    }

    // --- 4. HELPER FUNCTIONS ---

    function addMessage(content, type = "bot", isImage = false) {
        const div = document.createElement("div");
        div.className = `message ${type}`;

        if (isImage) {
            const container = document.createElement("div");
            container.className = "image-container";

            const img = document.createElement("img");
            img.src = content;
            img.onload = () => { chatMessages.scrollTop = chatMessages.scrollHeight; };

            const downloadBtn = document.createElement("a");
            downloadBtn.href = content;
            downloadBtn.download = `DesiScribe_Ad_${Date.now()}.jpg`;
            downloadBtn.className = "download-icon";
            downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i>'; // FontAwesome Icon
            downloadBtn.title = "Download Image";

            container.appendChild(img);
            container.appendChild(downloadBtn);
            div.appendChild(container);
        } else {
            div.textContent = content;
        }

        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function getFormData() {
        const business = businessInput.value.trim();
        const desc = productDescInput.value.trim();
        const lang = document.getElementById("languageSelect").value; // Get current language

        if (!business || !desc) {
            alert("Please enter a Business Name and Product Description!");
            return null;
        }

        return {
            business_type: business,
            ad_type: adTypeInput.value,
            product_description: desc,
            language: lang // Send to Backend
        };
    }

    // --- 5. GENERATION BUTTONS ---

    if (sloganBtn) {
        sloganBtn.addEventListener("click", async () => {
            const data = getFormData();
            if (!data) return;

            addMessage(`📝 Generating ${data.language} slogan...`, "user");
            sloganBtn.disabled = true;
            sloganBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const response = await fetch(`${API_BASE_URL}/generate-slogan`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (result.status === "success") {
                    addMessage(`✨ "${result.slogan}"`, "bot");
                } else {
                    addMessage("❌ Error: " + result.error, "bot");
                }
            } catch (err) {
                addMessage("❌ Network Error.", "bot");
            }
            sloganBtn.disabled = false;
            sloganBtn.innerHTML = '<i class="fa-solid fa-pen-nib"></i> Slogan';
        });
    }

    if (posterBtn) {
        posterBtn.addEventListener("click", async () => {
            const data = getFormData();
            if (!data) return;

            addMessage(`🎬 Designing ${data.language} poster...`, "user");
            posterBtn.disabled = true;
            posterBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const response = await fetch(`${API_BASE_URL}/generate-poster`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (result.status === "success") {
                    addMessage("✨ Poster Ready!", "bot");
                    addMessage(result.image_url, "bot", true);
                    addMessage(`Slogan: "${result.slogan}"`, "bot");
                } else {
                    addMessage("❌ Error: " + (result.error || "Unknown"), "bot");
                }
            } catch (err) {
                addMessage("❌ Network Error.", "bot");
            }
            posterBtn.disabled = false;
            posterBtn.innerHTML = '<i class="fa-solid fa-clapperboard"></i> Poster';
        });
    }

    // --- 6. MODAL RESET LOGIC ---
    // This restores the dropdown if the user closes and re-opens the chat
    if (describeBtn) {
        describeBtn.addEventListener("click", () => {
            chatModal.classList.add("active");

            if (inputForm) inputForm.style.display = "none";

            // Re-inject the HTML to ensure the Dropdown exists on reset
            chatMessages.innerHTML = `
                <div class="message bot">Hi! Pick a language & start! 👇</div>
                
                <div id="startOptions" class="option-container" style="flex-direction: column; gap: 15px;">
                    <select id="languageSelect" style="background: #1f2940; color: white; border: 1px solid #5876ff; padding: 10px; border-radius: 10px; width: 80%; margin: 0 auto;">
                        <option value="English">🇬🇧 English</option>
                        <option value="Hindi">🇮🇳 Hindi (हिंदी)</option>
                        <option value="Spanish">🇪🇸 Spanish</option>
                        <option value="French">🇫🇷 French</option>
                        <option value="German">🇩🇪 German</option>
                        <option value="Tamil">🇮🇳 Tamil</option>
                        <option value="Marathi">🇮🇳 Marathi</option>
                    </select>

                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button onclick="startManual()" class="option-btn">✍️ Enter Details</button>
                        <button onclick="startUpload()" class="option-btn">📸 Upload Photo</button>
                    </div>
                </div>
            `;

            // Re-bind the variables to the new DOM elements
            startOptions = document.getElementById("startOptions");
            languageSelect = document.getElementById("languageSelect");
        });
    }

    if (closeChatBtn) {
        closeChatBtn.addEventListener("click", () => {
            chatModal.classList.remove("active");
        });
    }
});