
import requests
import os

# The API is assumed to be running locally at http://127.0.0.1:5000
API_URL = "http://127.0.0.1:5000/ocr"

def create_mock_image():
    """Creates a simple mock image file for testing."""
    from PIL import Image
    img = Image.new('RGB', (100, 50), color = 'red')
    img.save('mock_image.png', 'PNG')
    print("Created mock_image.png")

def test_ocr_endpoint():
    try:
        create_mock_image()
        
        with open('mock_image.png', 'rb') as f:
            files = {'image': ( 'mock_image.png', f, 'image/png')}
            print(f"Sending POST request to {API_URL}...")
            response = requests.post(API_URL, files=files)
            
            print("Status Code:", response.status_code)
            print("Response JSON:", response.json())
            
    except requests.exceptions.RequestException as e:
        print(f"Error connecting to the API. Ensure the Flask server is running: {e}")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        if os.path.exists('mock_image.png'):
            os.remove('mock_image.png')
            print("Cleaned up mock_image.png")

if __name__ == '__main__':
    test_ocr_endpoint()
