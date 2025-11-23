import os
import io
import base64
import textwrap
import re
import time
import traceback
import requests
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
from huggingface_hub import InferenceClient
from PIL import Image, ImageDraw, ImageFont, ImageFilter

app = Flask(__name__)
CORS(app)

--- CONFIGURATION ---
HF_TOKEN = os.getenv("HF_TOKEN")
if not HF_TOKEN:
    print("⚠️ WARNING: No HF_TOKEN found. App might fail.")

# --- 1. AUTHENTICATION DATABASE (In-Memory) ---
USERS = {
    "admin": "admin123",
    "guest": "desi2025"
}
ACTIVE_SESSIONS = {}

# --- 2. AI CLIENTS ---
text_client = InferenceClient(model="Qwen/Qwen2.5-72B-Instruct", token=HF_TOKEN)
image_client = InferenceClient(model="stabilityai/stable-diffusion-xl-base-1.0", token=HF_TOKEN)

# --- 3. MIDDLEWARE: SECURITY CHECK ---
def check_auth():
    if request.endpoint in ['home', 'login'] or request.method == 'OPTIONS':
        return None
    
    user_token = request.headers.get('X-Auth-Token')
    if not user_token or user_token not in ACTIVE_SESSIONS:
        return jsonify({"status": "error", "error": "🔒 Unauthorized. Please Log In."}), 401

app.before_request(check_auth)

# --- HELPERS ---
def clean_text(text):
    text = re.sub(r"\[.*?\]", "", text)
    text = re.sub(r"<.*?>", "", text)
    text = text.replace('"', '').replace("'", "").strip()
    for prefix in ["Slogan:", "Here is a slogan:", "Answer:"]:
        if prefix in text: text = text.split(prefix)[-1].strip()
    return text

def enhance_image_prompt(business, desc, tone):
    base = f"A high-end commercial advertisement poster for {business} featuring {desc}."
    style = "High quality, 8k resolution, cinematic lighting."
    if "Catchy" in tone: style += " Vibrant colors, pop-art style, energetic."
    elif "Professional" in tone: style += " Sleek, minimalistic, modern office background."
    elif "Luxury" in tone: style += " Dark moody lighting, gold accents, elegant."
    elif "Humorous" in tone: style += " Playful, bright lighting, fun props."
    return f"{base} {style}"

# --- SMART LAYOUT ENGINE (BIG CAPTIONS VERSION) ---
def create_social_layout(img, business, slogan, format_type):
    # Load Fonts with LARGER sizes for better visibility
    try:
        title_font = ImageFont.truetype("font.ttf", 130) # Big Title
        slogan_font = ImageFont.truetype("font.ttf", 75) # Readable Slogan
        small_font = ImageFont.truetype("font.ttf", 40)
    except:
        title_font = ImageFont.load_default()
        slogan_font = ImageFont.load_default()
        small_font = ImageFont.load_default()

    if format_type == "Story":
        # --- INSTAGRAM STORY (9:16) ---
        width, height = 1080, 1920
        canvas = Image.new('RGB', (width, height), (0,0,0))
        
        # Blurred Background
        bg = img.resize((width + 200, height + 200))
        bg = bg.filter(ImageFilter.GaussianBlur(radius=30))
        left = (bg.width - width)/2
        top = (bg.height - height)/2
        bg = bg.crop((left, top, left + width, top + height))
        
        overlay = Image.new('RGBA', bg.size, (0,0,0,120)) # Darker overlay for text pop
        bg.paste(overlay, (0,0), overlay)
        canvas.paste(bg, (0,0))

        # Main Image
        img_w, img_h = 900, 900
        main_img = img.resize((img_w, img_h))
        border = Image.new('RGB', (img_w+20, img_h+20), (255,255,255))
        canvas.paste(border, (90, 500)) 
        canvas.paste(main_img, (100, 510))

        draw = ImageDraw.Draw(canvas)
        
        # Text Logic (Centered)
        bbox = draw.textbbox((0, 0), business.upper(), font=title_font)
        text_width = bbox[2] - bbox[0]
        draw.text(((width - text_width)/2, 200), business.upper(), font=title_font, fill="#FFD700")

        # Slogan (Wrapped tightly for large font)
        lines = textwrap.wrap(slogan, width=20) 
        y_text = 1500
        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=slogan_font)
            line_width = bbox[2] - bbox[0]
            draw.text(((width - line_width)/2, y_text), line, font=slogan_font, fill="white")
            y_text += 85
            
        draw.text(((width - 300)/2, 1800), "^ SWIPE UP ^", font=small_font, fill="#cccccc")
        return canvas

    else:
        # --- SQUARE POST / LANDSCAPE ---
        draw = ImageDraw.Draw(img)
        w, h = img.size
        
        # Taller Dark Overlay for Big Text
        overlay = Image.new('RGBA', img.size, (0,0,0,0))
        d = ImageDraw.Draw(overlay)
        d.rectangle([(0, h - 300), (w, h)], fill=(0, 0, 0, 180)) # Bottom box
        d.rectangle([(0, 0), (w, 180)], fill=(0, 0, 0, 150))     # Top box
        img = Image.alpha_composite(img.convert('RGBA'), overlay)
        draw = ImageDraw.Draw(img)

        # Business Name
        bbox = draw.textbbox((0, 0), business.upper(), font=title_font)
        text_width = bbox[2] - bbox[0]
        draw.text(((w - text_width) / 2, 25), business.upper(), font=title_font, fill="#FFD700")

        # Slogan
        lines = textwrap.wrap(slogan, width=25)
        y_text = h - 260
        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=slogan_font)
            line_width = bbox[2] - bbox[0]
            draw.text(((w - line_width) / 2, y_text), line, font=slogan_font, fill="white")
            y_text += 80
        return img

# --- ROBUST VISION QUERY ---
def query_vision_api(img_bytes, token):
    model = "Salesforce/blip-image-captioning-base"
    api_url = f"https://router.huggingface.co/hf-inference/models/{model}"
    headers = {"Authorization": f"Bearer {token}"}
    
    for attempt in range(3):
        try:
            response = requests.post(api_url, headers=headers, data=img_bytes)
            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list) and len(result) > 0:
                    return result[0].get('generated_text', 'A product image')
            elif response.status_code == 503:
                time.sleep(2)
                continue
            else:
                print(f"Vision Failed: {response.status_code}")
                break
        except: break
    return None

# --- ROUTES ---

@app.route('/', methods=['GET'])
def home():
    return jsonify({"status": "active", "message": "Desi-Scribe Secure Backend Running"})

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if username in USERS and USERS[username] == password:
        token = str(uuid.uuid4())
        ACTIVE_SESSIONS[token] = username
        return jsonify({"status": "success", "token": token, "username": username})
    
    return jsonify({"status": "error", "error": "Invalid Credentials"}), 401

@app.route('/analyze-image', methods=['POST'])
def analyze_image():
    try:
        if 'file' not in request.files: return jsonify({"error": "No file"}), 400
        file = request.files['file']
        
        image = Image.open(file.stream).convert("RGB")
        image.thumbnail((512, 512)) 
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG')
        img_bytes = img_byte_arr.getvalue()

        caption = query_vision_api(img_bytes, HF_TOKEN)
        if not caption: caption = "A product image"

        guess_prompt = f"Based on: '{caption}', guess a short Business Name (max 3 words) and Tone. Format: Name | Tone"
        guess_res = text_client.chat_completion(messages=[{"role": "user", "content": guess_prompt}], max_tokens=50)
        guess_text = guess_res.choices[0].message.content.strip()
        
        if "|" in guess_text: name, tone = guess_text.split("|", 1)
        else: name, tone = "Auto Business", "Professional"

        return jsonify({"status": "success", "description": caption, "business_type": name.strip(), "tone": tone.strip()})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/generate-slogan', methods=['POST'])
def generate_slogan():
    try:
        data = request.get_json()
        lang = data.get('language', 'English')
        prompt = (f"Write a {data.get('ad_type')} slogan for {data.get('business_type')} "
                  f"({data.get('product_description')}) in {lang} language. Output ONLY the slogan.")
        res = text_client.chat_completion(messages=[{"role": "user", "content": prompt}], max_tokens=60)
        return jsonify({"status": "success", "slogan": clean_text(res.choices[0].message.content)})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/generate-poster', methods=['POST'])
def generate_poster():
    try:
        data = request.get_json()
        b_type = data.get('business_type')
        desc = data.get('product_description')
        tone = data.get('ad_type')
        lang = data.get('language', 'English')
        fmt = data.get('format', 'Square')

        # 1. Slogan
        slogan_prompt = f"Write a catchy 5-word slogan for {b_type} in {lang} language."
        slogan_res = text_client.chat_completion(messages=[{"role": "user", "content": slogan_prompt}], max_tokens=40)
        slogan = clean_text(slogan_res.choices[0].message.content)

        # 2. Image
        image_prompt = enhance_image_prompt(b_type, desc, tone)
        img = image_client.text_to_image(image_prompt)

        # 3. Smart Layout (with Big Fonts)
        final_img = create_social_layout(img, b_type, slogan, fmt)

        buffered = io.BytesIO()
        final_img.convert('RGB').save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode()

        return jsonify({"status": "success", "image_url": f"data:image/jpeg;base64,{img_str}", "slogan": slogan})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port)
