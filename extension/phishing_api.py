from flask import Flask, jsonify, request
from flask_cors import CORS
import os, csv, re
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from keras.models import Model
from keras.layers import Input, Dense

app = Flask(__name__)
CORS(app)

### ---------- 第一部分：取得 phishing URLs ----------
def load_phishing_urls():
    phishing_urls = []
    file_path = os.path.join(os.getcwd(), 'assets', 'phishing_urls.csv')
    with open(file_path, mode='r', encoding='utf-8') as file:
        reader = csv.reader(file)
        next(reader)  # Skip header
        for row in reader:
            phishing_urls.append(row[1].strip())
    return phishing_urls

@app.route('/phishing-urls', methods=['GET'])
def get_phishing_urls():
    return jsonify(load_phishing_urls())

### ---------- 第二部分：Autoencoder 模型 ----------
data = pd.read_csv("assets/phishing_urls.csv")
urls = data['url']

blacklist_keywords = [".rest", ".cfd", "allegrolokalnie", "allegro.pl-"]

def is_blacklisted(url):
    return int(any(kw in url for kw in blacklist_keywords))

def extract_features(url):
    features = {
        'url_length': len(url),
        'num_dots': url.count('.'),
        'num_hyphens': url.count('-'),
        'num_digits': len(re.findall(r'\d', url)),
        'has_https': int('https' in url),
        'has_at': int('@' in url),
        'has_ip': int(bool(re.search(r'\d+\.\d+\.\d+\.\d+', url))),
        'has_suspicious_tld': int(any(url.endswith(ext) for ext in ['.rest', '.cfd', '.top', '.xyz'])),
        'starts_with_http': int(url.startswith('http')),
        'contains_blacklist_word': is_blacklisted(url),
    }
    return list(features.values())

features_list = [extract_features(url) for url in urls]
X = np.array(features_list)
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

input_dim = X_scaled.shape[1]
encoding_dim = 5

input_layer = Input(shape=(input_dim,))
encoded = Dense(encoding_dim, activation='relu')(input_layer)
decoded = Dense(input_dim, activation='linear')(encoded)

autoencoder = Model(inputs=input_layer, outputs=decoded)
autoencoder.compile(optimizer='adam', loss='mse')
autoencoder.fit(X_scaled, X_scaled, epochs=20, batch_size=128, shuffle=True, verbose=0)

def predict_url(url):
    if is_blacklisted(url):
        return "Phishing (blacklist)"
    feats = np.array([extract_features(url)])
    feats_scaled = scaler.transform(feats)
    recon = autoencoder.predict(feats_scaled, verbose=0)
    mse = np.mean(np.square(feats_scaled - recon))
    threshold = 0.5
    return "Phishing (autoencoder)" if mse > threshold else "Legit"

@app.route('/predict-text', methods=['POST'])
def predict_text():
    data = request.get_json()
    text = data.get('text', '')
    result = predict_url(text)
    return jsonify({"result": result})

@app.route('/predict_url', methods=['POST'])
def predict_url_batch():
    data = request.get_json()
    urls = data.get('urls', [])
    results = []
    for url in urls:
        res = predict_url(url)
        results.append(res != "Legit")  # True 表示可疑
    return jsonify({"results": results})

### ---------- 啟動 Flask ----------
if __name__ == '__main__':
    app.run(debug=True, port=5000)
