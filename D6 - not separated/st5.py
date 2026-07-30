import os
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.metrics import (
    classification_report, confusion_matrix, accuracy_score, 
    precision_score, recall_score, f1_score, roc_curve, roc_auc_score
)
import matplotlib.pyplot as plt
import seaborn as sns

# DATA BALANCING MODULE
from imblearn.over_sampling import SMOTE

# DEEP LEARNING ARCHITECTURE
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, Input
from tensorflow.keras.callbacks import EarlyStopping

# FIREBASE ADMIN SDK IMPORTS
import firebase_admin
from firebase_admin import credentials, storage

# Initialize Firebase Connection Parameters
BUCKET_NAME = "flooded-95eeb.firebasestorage.app"
cred_path = "serviceAccountKey.json"

# Load local operational records
df = pd.read_csv('weather_datasets2.csv')

print("="*60)
print("FINAL AUTOMATED MACHINE LEARNING PIPELINE: COMPLETE DEPLOYMENT")
print("="*60)

target_column = input("Enter target column name (e.g., flood): ").strip()
if target_column not in df.columns:
    print(f"[X] Target column error. Available options: {df.columns.tolist()}")
    exit()

X = df.drop(target_column, axis=1)
y = df[target_column]

# Handle dynamic structural conversions 
if y.dtype == 'object':
    le = LabelEncoder()
    y = le.fit_transform(y)
else:
    y = (y > 0).astype(int) if len(y.unique()) > 2 else y.astype(int)

X = X.fillna(X.mean())
y = y.fillna(y.mode()[0])

# Partition Holdout Splitting (80/20 train/test split)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Apply SMOTE to handle dataset imbalance
smote = SMOTE(random_state=42, k_neighbors=5)
X_train_resampled, y_train_resampled = smote.fit_resample(X_train, y_train)

# Normalize boundaries using MinMaxScaler to match JavaScript scaling rules
scaler = MinMaxScaler()
X_train_scaled = scaler.fit_transform(X_train_resampled)
X_test_scaled = scaler.transform(X_test)

X_train_final, X_val, y_train_final, y_val = train_test_split(
    X_train_scaled, y_train_resampled, test_size=0.1, random_state=42, stratify=y_train_resampled
)

# Compile Sequential Layers matching your web configuration topology parameters
model = Sequential([
    Input(shape=(X_train_final.shape[1],)),
    Dense(16, activation='relu'),
    Dropout(0.2),
    Dense(8, activation='relu'),
    Dense(1, activation='sigmoid')
])

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.01),
    loss='binary_crossentropy',
    metrics=['accuracy']
)

callbacks = [
    EarlyStopping(monitor='val_loss', patience=100, restore_best_weights=True, verbose=1)
]

# Run optimization loops
history = model.fit(
    X_train_final, y_train_final,
    validation_data=(X_val, y_val),
    epochs=500,
    batch_size=16,
    callbacks=callbacks,
    verbose=1
)

y_pred_proba = model.predict(X_test_scaled).flatten()
y_pred = (y_pred_proba >= 0.40).astype(int)

# Calculate Metric Boundaries for Analysis
final_accuracy = accuracy_score(y_test, y_pred)
final_precision = precision_score(y_test, y_pred)
final_recall = recall_score(y_test, y_pred)
final_f1 = f1_score(y_test, y_pred)
final_auc = roc_auc_score(y_test, y_pred_proba)

print("\n" + "="*60)
print("MODEL EXECUTION PERFORMANCE METRICS")
print("="*60)
print(f"   Accuracy  : {final_accuracy:.4f} ({final_accuracy*100:.2f}%)")
print(f"   Precision : {final_precision:.4f} ({final_precision*100:.2f}%)")
print(f"   Recall    : {final_recall:.4f} ({final_recall*100:.2f}%)")
print(f"   F1-Score  : {final_f1:.4f} ({final_f1*100:.2f}%)")
print(f"   AUC Score : {final_auc:.4f}")
print("="*60)

# ====================================================================
# RENDERING EVALUATION VISUAL CHARTS MODULE (2x2 GRID CONFIGURATION)
# ====================================================================
print("\n[~] Generating required validation charts...")

# Initialize a 2x2 grid structure to display all metrics smoothly at once
fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# 1. Top-Left: Training Loss Curve
axes[0, 0].plot(history.history['loss'], label='Train Loss', color='blue', linewidth=2)
axes[0, 0].plot(history.history['val_loss'], label='Val Loss', color='orange', linewidth=2)
axes[0, 0].set_title('TensorFlow Model Loss Curve')
axes[0, 0].set_xlabel('Epoch')
axes[0, 0].set_ylabel('Loss')
axes[0, 0].legend()
axes[0, 0].grid(True, alpha=0.3)

# 2. Top-Right: Confusion Matrix Heatmap
cm = confusion_matrix(y_test, y_pred)
sns.heatmap(cm, annot=True, fmt='d', cmap='Reds', ax=axes[0, 1],
            xticklabels=['No Flood', 'Flood'], 
            yticklabels=['No Flood', 'Flood'])
axes[0, 1].set_title('Confusion Matrix - Flash Flood Verification')
axes[0, 1].set_ylabel('Actual Status')
axes[0, 1].set_xlabel('Predicted Status')

# 3. Bottom-Left: ROC Validation Curve
fpr, tpr, thresholds = roc_curve(y_test, y_pred_proba)
axes[1, 0].plot(fpr, tpr, color='darkblue', linewidth=2, label=f'MLP Engine (AUC = {final_auc:.3f})')
axes[1, 0].plot([0, 1], [0, 1], color='gray', linestyle='--', label='Baseline')
axes[1, 0].set_xlim([0.0, 1.0])
axes[1, 0].set_ylim([0.0, 1.05])
axes[1, 0].set_title('Receiver Operating Characteristic (ROC)')
axes[1, 0].set_xlabel('False Positive Rate')
axes[1, 0].set_ylabel('True Positive Rate')
axes[1, 0].legend(loc="lower right")
axes[1, 0].grid(True, alpha=0.3)

# 4. Bottom-Right: Core Classification Metrics Performance Bar Graph
metrics_names = ['Accuracy', 'Precision', 'Recall', 'F1-Score']
metrics_values = [final_accuracy, final_precision, final_recall, final_f1]
metrics_colors = ['#0d6efd', '#198754', '#ffc107', '#dc3545']

bars = axes[1, 1].bar(metrics_names, metrics_values, color=metrics_colors, width=0.5)
axes[1, 1].set_title('Core Model Performance Classification Metrics')
axes[1, 1].set_ylabel('Score Ratio (0.0 - 1.0)')
axes[1, 1].set_ylim([0.0, 1.1]) 
axes[1, 1].grid(True, axis='y', alpha=0.3)

# Add exact percentage text labels on top of each performance metric bar
for bar in bars:
    yval = bar.get_height()
    axes[1, 1].text(
        bar.get_x() + bar.get_width()/2.0, 
        yval + 0.02, 
        f"{yval:.2%}", 
        ha='center', 
        va='bottom', 
        fontweight='bold'
    )

plt.tight_layout()
print("[V] Charts compiled. Displaying evaluation windows metrics group...")
plt.show()

# ====================================================================
# INTERACTIVE FIREBASE REMOTING SAVE PROMPT
# ====================================================================
save_choice = input("\nDo you want to save and upload this model to Firebase Storage? (yes/no): ").strip().lower()

if save_choice in ['yes', 'y']:
    if not os.path.exists(cred_path):
        print(f"\n[X] ERROR: Missing token credential file: '{cred_path}'")
        print("    Upload aborted. Please place your service account token inside this directory.")
        exit()

    print("\n[~] Authenticating secure connection tokens with Firebase...")
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred, {
        'storageBucket': BUCKET_NAME
    })

    # Exact layout topology structures formatting sequence
    model_json_str = model.to_json()
    model_topology = json.loads(model_json_str)["config"]

    # --- TF.JS COMPATIBILITY PATCH 1: INPUT LAYER PATCH ---
    try:
        first_layer = model_topology["layers"][0]
        if first_layer["class_name"] == "InputLayer":
            input_dim = X_train_final.shape[1]
            first_layer["config"]["batchInputShape"] = [None, input_dim]
            if "sparse" in first_layer["config"]:
                del first_layer["config"]["sparse"]
    except Exception as patch_err:
        pass

    # --- TF.JS COMPATIBILITY PATCH 2: PARALLEL WEIGHT TARGET NAME SYNCHRONIZATION ---
    weight_specs = []
    weights_bytes = bytearray()

    # Extract clean parallel layer lists matching dense parameters directly while jumping over dropout
    model_dense_objects = [layer for layer in model.layers if isinstance(layer, tf.keras.layers.Dense)]
    topology_dense_layers = [layer for layer in model_topology["layers"] if layer["class_name"] == "Dense"]

    for config_layer, layer_obj in zip(topology_dense_layers, model_dense_objects):
        layer_name = config_layer["config"]["name"]
        kernel_weight = layer_obj.kernel
        bias_weight = layer_obj.bias
        
        # Map Kernel properties
        weight_specs.append({
            "name": f"{layer_name}/kernel",
            "shape": kernel_weight.shape.as_list(),
            "dtype": kernel_weight.dtype.name if hasattr(kernel_weight.dtype, 'name') else str(kernel_weight.dtype)
        })
        weights_bytes.extend(kernel_weight.numpy().astype(np.float32).tobytes())
        
        # Map Bias properties
        weight_specs.append({
            "name": f"{layer_name}/bias",
            "shape": bias_weight.shape.as_list(),
            "dtype": bias_weight.dtype.name if hasattr(bias_weight.dtype, 'name') else str(bias_weight.dtype)
        })
        weights_bytes.extend(bias_weight.numpy().astype(np.float32).tobytes())

    # Build schema payload block structure matching saveModel data expectations
    js_matched_manifest = {
        "modelTopology": {
            "class_name": "Sequential",
            "config": model_topology
        },
        "weightSpecs": weight_specs,
        "metadata": {
            "minVals": scaler.data_min_.tolist(),
            "maxVals": scaler.data_max_.tolist()
        }
    }

    json_filename = 'flood_model.json'
    bin_filename = 'flood_weights.bin'

    with open(json_filename, 'w') as f:
        json.dump(js_matched_manifest, f, indent=2)

    with open(bin_filename, 'wb') as f:
        f.write(weights_bytes)

    # Cloud streaming dispatch blocks execution
    print(f"[~] Streaming cloud architecture modules to bucket: '{BUCKET_NAME}'...")
    bucket = storage.bucket()

    cloud_json_path = 'models/flood_model.json'
    cloud_bin_path = 'models/flood_weights.bin'

    bucket.blob(cloud_json_path).upload_from_filename(json_filename)
    print(f"[V] Successfully uploaded metadata layer file to: models/flood_model.json")
    
    bucket.blob(cloud_bin_path).upload_from_filename(bin_filename)
    print(f"[V] Successfully uploaded weights configuration parameters binary to: models/flood_weights.bin")

    print("\n" + "="*60)
    print("[V] SUCCESS: DISASTER FLOOD MONITORING MODEL DEPLOYED TO FIREBASE!")
    print("="*60)
else:
    print("\n[!] Save operation declined. Assets written locally only.")
