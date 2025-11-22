import os
import io
import base64
import textwrap
import re
import time
import traceback
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from huggingface_hub import InferenceClient
from PIL import Image, ImageDraw, ImageFont

app = Flask(__name__)
CORS(app)

# --- CONFIGURATION ---
# ⚠️ REPLACE WITH YOUR ACTUAL TOKEN
HF_TOKEN = "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"

# 1. Text Client (Qwen 2.5)
text_client = InferenceClient(model="Qwen/Qwen2.5-72B-Instruct", token=HF_TOKEN)

# 2. Image Client (SDXL)
image_client = InferenceClient(model="stabilityai/stable-diffusion-xl-base-1.0", token=HF_TOKEN)

# --- HELPER: CLEAN TEXT ---
def clean_text(text):
    text = re.sub(r"\[.*?\]", "", text)
    text = re.sub(r"<.*?>", "", text)
    text = text.replace('"', '').replace("'", "").strip()
    for prefix in ["Slogan:", "Here is a slogan:", "Answer:"]:
        if prefix in text:
            text = text.split(prefix)[-1].strip()
    return text

# --- HELPER: ENHANCE IMAGE PROMPT ---
def enhance_image_prompt(business, desc, tone):
    base = f"A high-end commercial advertisement poster for {business} featuring {desc}."
    style = "High quality, 8k resolution, cinematic lighting."
    
    if "Catchy" in tone: style += " Vibrant colors, pop-art style, energetic."
    elif "Professional" in tone: style += " Sleek, minimalistic, modern office background."
    elif "Luxury" in tone: style += " Dark moody lighting, gold accents, elegant, macro shot."
    elif "Humorous" in tone: style += " Playful, bright lighting, fun props."
    
    return f"{base} {style}"

# --- HELPER: DRAW TEXT ON IMAGE ---
def draw_text_on_image(img, business_name, slogan):
    draw = ImageDraw.Draw(img)
    width, height = img.size
    
    # Try to load custom font (for Hindi/Regional support), fallback to Arial/Default
    try:
        title_font = ImageFont.truetype("font.ttf", 80)
        slogan_font = ImageFont.truetype("font.ttf", 45)
    except:
        try:
            title_font = ImageFont.truetype("arial.ttf", 80)
            slogan_font = ImageFont.truetype("arial.ttf", 45)
        except:
            title_font = ImageFont.load_default()
            slogan_font = ImageFont.load_default()

    overlay = Image.new('RGBA', img.size, (0,0,0,0))
    overlay_draw = ImageDraw.Draw(overlay)
    
    overlay_draw.rectangle([(0, height - 220), (width, height)], fill=(0, 0, 0, 180))
    overlay_draw.rectangle([(0, 0), (width, 120)], fill=(0, 0, 0, 150))
    
    img = Image.alpha_composite(img.convert('RGBA'), overlay)
    draw = ImageDraw.Draw(img)

    bbox = draw.textbbox((0, 0), business_name.upper(), font=title_font)
    text_w = bbox[2] - bbox[0]
    draw.text(((width - text_w) / 2, 20), business_name.upper(), font=title_font, fill="#FFD700")

    lines = textwrap.wrap(slogan, width=40)
    y_text = height - 180
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=slogan_font)
        line_w = bbox[2] - bbox[0]
        draw.text(((width - line_w) / 2, y_text), line, font=slogan_font, fill="white")
        y_text += 55

    return img

# --- HELPER: ROBUST VISION QUERY ---
def query_vision_api(img_bytes, token):
    # Using the stable Router URL
    model = "Salesforce/blip-image-captioning-base"
    api_url = f"https://router.huggingface.co/hf-inference/models/{model}"
    headers = {"Authorization": f"Bearer {token}"}
    
    for attempt in range(3):
        print(f"--- Vision Attempt {attempt+1} ---")
        try:
            response = requests.post(api_url, headers=headers, data=img_bytes)
            
            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list) and len(result) > 0:
                    return result[0].get('generated_text', 'A product image')
            elif response.status_code == 503:
                print("Model loading... waiting 2s")
                time.sleep(2)
                continue
            else:
                print(f"Vision Failed: {response.status_code} - {response.text}")
                break
        except Exception as e:
            print(f"Request Exception: {e}")
            break
            
    return None

# --- ENDPOINT 1: ANALYZE IMAGE ---
@app.route('/analyze-image', methods=['POST'])
def analyze_image():
    try:
        if 'file' not in request.files:
            return jsonify({"status": "error", "error": "No file uploaded"}), 400
        
        file = request.files['file']
        
        image = Image.open(file.stream).convert("RGB")
        image.thumbnail((512, 512)) 
        
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG')
        img_bytes = img_byte_arr.getvalue()

        caption = query_vision_api(img_bytes, HF_TOKEN)
        
        if not caption:
            caption = "A product image"
            print("Vision failed, using default caption.")

        print(f"Vision saw: {caption}")

        guess_prompt = (f"Based on this image description: '{caption}', "
                        f"guess a short Business Name (max 3 words) and a Tone. Format: Name | Tone")
        
        guess_res = text_client.chat_completion(
            messages=[{"role": "user", "content": guess_prompt}], max_tokens=50
        )
        guess_text = guess_res.choices[0].message.content.strip()
        
        if "|" in guess_text:
            name, tone = guess_text.split("|", 1)
        else:
            name, tone = "Auto Business", "Professional"

        return jsonify({
            "status": "success", 
            "description": caption,
            "business_type": name.strip(),
            "tone": tone.strip()
        })

    except Exception as e:
        print("!!! CRITICAL VISION ERROR !!!")
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500

# --- ENDPOINT 2: GENERATE SLOGAN (Multilingual) ---
@app.route('/generate-slogan', methods=['POST'])
def generate_slogan():
    try:
        data = request.get_json()
        lang = data.get('language', 'English')
        
        prompt = (f"Write a {data.get('ad_type')} slogan for {data.get('business_type')} "
                  f"({data.get('product_description')}) in {lang} language. "
                  f"Output ONLY the slogan in {lang}.")
                  
        res = text_client.chat_completion(messages=[{"role": "user", "content": prompt}], max_tokens=60)
        return jsonify({"status": "success", "slogan": clean_text(res.choices[0].message.content)})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

# --- ENDPOINT 3: GENERATE IMAGE ---
@app.route('/generate-image', methods=['POST'])
def generate_image():
    try:
        data = request.get_json()
        prompt = enhance_image_prompt(data.get('business_type'), data.get('product_description'), data.get('ad_type'))
        image = image_client.text_to_image(prompt)
        buffered = io.BytesIO()
        image.save(buffered, format="JPEG", quality=85)
        img_str = base64.b64encode(buffered.getvalue()).decode()
        return jsonify({"status": "success", "image_url": f"data:image/jpeg;base64,{img_str}"})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

# --- ENDPOINT 4: GENERATE POSTER (Multilingual) ---
@app.route('/generate-poster', methods=['POST'])
def generate_poster():
    try:
        data = request.get_json()
        b_type = data.get('business_type')
        desc = data.get('product_description')
        tone = data.get('ad_type')
        lang = data.get('language', 'English')

        # 1. Slogan
        slogan_prompt = f"Write a catchy 5-word slogan for {b_type} in {lang} language."
        slogan_res = text_client.chat_completion(messages=[{"role": "user", "content": slogan_prompt}], max_tokens=40)
        slogan = clean_text(slogan_res.choices[0].message.content)

        # 2. Image
        image_prompt = enhance_image_prompt(b_type, desc, tone)
        img = image_client.text_to_image(image_prompt)

        # 3. Combine
        final_img = draw_text_on_image(img, b_type, slogan)

        buffered = io.BytesIO()
        final_img.convert('RGB').save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode()

        return jsonify({"status": "success", "image_url": f"data:image/jpeg;base64,{img_str}", "slogan": slogan})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

if __name__ == '__main__':
    # Use the PORT environment variable provided by Render, or default to 5001
    port = int(os.environ.get('PORT', 5001))
    # host='0.0.0.0' is required for the server to be accessible externally
    app.run(host='0.0.0.0', port=port)
