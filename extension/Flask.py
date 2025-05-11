from flask import Flask, jsonify
import csv
import os
from flask_cors import CORS
app = Flask(__name__)
CORS(app)

def load_phishing_urls():
    phishing_urls = []
    file_path = os.path.join(os.getcwd(), 'assets', 'phishing_urls.csv')
    with open(file_path, mode='r', encoding='utf-8') as file:
        reader = csv.reader(file)
        next(reader)  # Skip header if present
        for row in reader:
            phishing_urls.append(row[1].strip())
    return phishing_urls

@app.route('/phishing-urls', methods=['GET'])
def get_phishing_urls():
    phishing_urls = load_phishing_urls()
    return jsonify(phishing_urls)

if __name__ == '__main__':
    app.run(debug=True, port=5000)