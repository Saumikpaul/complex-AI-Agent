
import os
from flask import Flask, request, jsonify
from PIL import Image
import io

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/ocr', methods=['POST'])
def ocr_endpoint():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file:
        try:
            # Read the image file into a BytesIO stream
            image_stream = io.BytesIO(file.read())
            
            # Verify the file using Pillow
            with Image.open(image_stream) as img:
                # Mock OCR Process: Simulate extraction
                # In a real scenario, integrate an actual OCR library like Tesseract
                mock_text = f"Successfully processed image '{file.filename}'. Mock OCR Result: Extracted text simulating analysis of a {img.format} image with size {img.size}."
                
                return jsonify({'status': 'success', 'extracted_text': mock_text}), 200
        except Exception as e:
            return jsonify({'error': f'Error processing image: {str(e)}'}), 500

if __name__ == '__main__':
    # Run the app
    # Consider using a production-ready server like gunicorn in real deployment
    app.run(debug=True, host='0.0.0.0', port=5000)
