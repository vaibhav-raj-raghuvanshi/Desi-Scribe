document.addEventListener("DOMContentLoaded", () => {

    // ⚠️ UPDATE THIS WITH YOUR RENDER URL
    // ✅ LOCALHOST URL (For testing on your PC)
    const API_BASE_URL = "https://desi-scribe.onrender.com/";

    // ❌ COMMENT OUT THE RENDER URL FOR NOW
    // const API_BASE_URL = "https://your-app-name.onrender.com";

    // --- 1. AUTHENTICATION LOGIC ---
    const loginOverlay = document.getElementById("loginOverlay");
    const usernameInput = document.getElementById("usernameInput");
    const passwordInput = document.getElementById("passwordInput");
    const loginError = document.getElementById("loginError");

    // Check for existing session
    let SESSION_TOKEN = localStorage.getItem("DESI_SESSION_TOKEN");

    if (SESSION_TOKEN) {
        if (loginOverlay) loginOverlay.style.display = "none";
    }

    window.attemptLogin = async function () {
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) return;

        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (result.status === "success") {
                SESSION_TOKEN = result.token;
                localStorage.setItem("DESI_SESSION_TOKEN", SESSION_TOKEN);
                loginOverlay.style.display = "none";
            } else {
                loginError.style.display = "block";
                loginError.innerText = "❌ " + result.error;
            }
        } catch (err) {
            loginError.style.display = "block";
            loginError.innerText = "❌ Connection Error. Is Backend Running?";
        }
    };

    // Secure Fetch Wrapper (Adds Token to every request)
    async function authenticatedFetch(endpoint, options = {}) {
        if (!options.headers) options.headers = {};
        options.headers['X-Auth-Token'] = SESSION_TOKEN;

        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

        if (response.status === 401) {
            localStorage.removeItem("DESI_SESSION_TOKEN");
            if (loginOverlay) loginOverlay.style.display = "flex";
            if (loginError) {
                loginError.style.display = "block";
                loginError.innerText = "❌ Session Expired. Please login again.";
            }
            throw new Error("Unauthorized");
        }
        return response;
    }

    // --- 2. DOM ELEMENTS ---
    const describeBtn = document.getElementById("desiDescribeBtn");
    const chatModal = document.getElementById("chatModal");
    const closeChatBtn = document.getElementById("closeChat");
    const chatMessages = document.getElementById("chatMessages");

    // Dynamic Elements
    let startOptions = document.getElementById("startOptions");
    let languageSelect = document.getElementById("languageSelect");

    // UI Sections
    const inputForm = document.getElementById("inputForm");
    const fileInput = document.getElementById("imageUploadInput");

    // Inputs
    const businessInput = document.getElementById("businessType");
    const adTypeInput = document.getElementById("adType");
    const productDescInput = document.getElementById("productDesc");
    const formatSelect = document.getElementById("formatSelect");

    // Buttons
    const sloganBtn = document.getElementById("generateSloganBtn");
    const posterBtn = document.getElementById("generatePosterBtn");
    const micBtn = document.getElementById("micBtn");

    // --- 3. SPEECH RECOGNITION LOGIC ---
    if (micBtn) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;

            const langMap = {
                'English': 'en-US', 'Hindi': 'hi-IN', 'Spanish': 'es-ES',
                'French': 'fr-FR', 'German': 'de-DE', 'Tamil': 'ta-IN', 'Marathi': 'mr-IN'
            };

            micBtn.addEventListener("click", () => {
                if (micBtn.classList.contains("listening")) {
                    recognition.stop();
                } else {
                    // Sync language with dropdown
                    const currentLang = document.getElementById("languageSelect")?.value || 'English';
                    recognition.lang = langMap[currentLang] || 'en-US';
                    recognition.start();
                }
            });

            recognition.onstart = () => {
                micBtn.classList.add("listening");
                productDescInput.placeholder = "Listening... Speak now!";
            };

            recognition.onend = () => {
                micBtn.classList.remove("listening");
                productDescInput.placeholder = "Describe product details...";
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                if (productDescInput.value) {
                    productDescInput.value += " " + transcript;
                } else {
                    productDescInput.value = transcript;
                }
            };
        } else {
            micBtn.style.display = "none";
        }
    }

    // --- 4. MODE SWITCHING ---
    window.startManual = function () {
        startOptions = document.getElementById("startOptions");
        languageSelect = document.getElementById("languageSelect");
        const lang = languageSelect ? languageSelect.value : "English";

        if (startOptions) startOptions.style.display = "none";
        if (inputForm) inputForm.style.display = "flex";

        addMessage(`✍️ Manual Mode selected (${lang}).`, "user");
        addMessage("Okay! Fill in the form below.", "bot");
    };

    window.startUpload = function () {
        if (fileInput) fileInput.click();
    };

    // --- 5. HANDLE FILE UPLOAD ---
    if (fileInput) {
        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (startOptions) startOptions.style.display = "none";
            addMessage("📸 Uploading image...", "user");
            addMessage("Analyzing image details... 🧠", "bot");

            const formData = new FormData();
            formData.append("file", file);

            try {
                const res = await authenticatedFetch('/analyze-image', { method: "POST", body: formData });
                const result = await res.json();

                if (result.status === "success") {
                    businessInput.value = result.business_type;
                    productDescInput.value = result.description;
                    inputForm.style.display = "flex";
                    addMessage(`I see: "${result.description}".`, "bot");
                    addMessage(`Form auto-filled!`, "bot");
                } else {
                    addMessage("❌ Error: " + result.error, "bot");
                    inputForm.style.display = "flex";
                }
            } catch (err) {
                if (err.message !== "Unauthorized") addMessage("❌ Network Error.", "bot");
                inputForm.style.display = "flex";
            }
        });
    }

    // --- 6. HELPER FUNCTIONS ---
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
            downloadBtn.download = `DesiScribe_${Date.now()}.jpg`;
            downloadBtn.className = "download-icon";
            downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i>';
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
        const lang = document.getElementById("languageSelect")?.value || "English";
        const fmt = document.getElementById("formatSelect")?.value || "Square";

        if (!business || !desc) {
            alert("Please enter a Business Name and Product Description!");
            return null;
        }
        return { business_type: business, ad_type: adTypeInput.value, product_description: desc, language: lang, format: fmt };
    }

    // --- 7. BUTTON LISTENERS ---
    if (sloganBtn) {
        sloganBtn.addEventListener("click", async () => {
            const data = getFormData();
            if (!data) return;
            addMessage(`📝 Generating slogan...`, "user");
            sloganBtn.disabled = true;
            sloganBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const response = await authenticatedFetch('/generate-slogan', {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (result.status === "success") addMessage(`✨ "${result.slogan}"`, "bot");
                else addMessage("❌ Error: " + result.error, "bot");
            } catch (err) {
                if (err.message !== "Unauthorized") addMessage("❌ Network Error.", "bot");
            }
            sloganBtn.disabled = false;
            sloganBtn.innerHTML = '<i class="fa-solid fa-pen-nib"></i> Slogan';
        });
    }

    if (posterBtn) {
        posterBtn.addEventListener("click", async () => {
            const data = getFormData();
            if (!data) return;
            addMessage(`🎬 Designing ${data.format} ad...`, "user");
            posterBtn.disabled = true;
            posterBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const response = await authenticatedFetch('/generate-poster', {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (result.status === "success") {
                    addMessage("✨ Design Ready!", "bot");
                    addMessage(result.image_url, "bot", true);
                    addMessage(`Slogan: "${result.slogan}"`, "bot");
                } else {
                    addMessage("❌ Error: " + (result.error || "Unknown"), "bot");
                }
            } catch (err) {
                if (err.message !== "Unauthorized") addMessage("❌ Network Error.", "bot");
            }
            posterBtn.disabled = false;
            posterBtn.innerHTML = '<i class="fa-solid fa-clapperboard"></i> Generate';
        });
    }

    // --- 8. MODAL RESET ---
    if (describeBtn) {
        describeBtn.addEventListener("click", () => {
            chatModal.classList.add("active");
            if (inputForm) inputForm.style.display = "none";

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
