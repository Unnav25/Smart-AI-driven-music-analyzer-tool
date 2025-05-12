import os
import json
import numpy as np
import librosa
import tensorflow as tf
from tensorflow import layers, models
from sklearn.model_selection import train_test_split

# Constants
SAMPLE_RATE = 22050
DURATION = 5  # seconds
N_MELS = 128
N_FFT = 2048
HOP_LENGTH = 512


AUDIO_FOLDER = r"D:\CSE start\C language\music folder\mp3 folder"

def load_and_preprocess_audio(file_path):
    audio, sr = librosa.load(file_path, sr=SAMPLE_RATE, duration=DURATION)
    if len(audio) > SAMPLE_RATE * DURATION:
        audio = audio[:SAMPLE_RATE * DURATION]
    else:
        audio = np.pad(audio, (0, SAMPLE_RATE * DURATION - len(audio)))
    mel_spec = librosa.feature.melspectrogram(
        y=audio,
        sr=SAMPLE_RATE,
        n_mels=N_MELS,
        n_fft=N_FFT,
        hop_length=HOP_LENGTH
    )

    
    mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
    mel_spec_db = (mel_spec_db - mel_spec_db.min()) / (mel_spec_db.max() - mel_spec_db.min())

    return mel_spec_db

def create_dataset():
    X = []
    y = []
    song_files = [f for f in os.listdir(AUDIO_FOLDER) if f.endswith('.mp3')]
    song_files.sort()  
    for i, file_name in enumerate(song_files):
        file_path = os.path.join(AUDIO_FOLDER, file_name)
        try:
            mel_spec = load_and_preprocess_audio(file_path)
            X.append(mel_spec)
            y.append(i)
        except Exception as e:
            print(f"Error processing {file_name}: {str(e)}")

    X = np.array(X)
    y = np.array(y)

    X = X.reshape((-1, N_MELS, X.shape[2], 1))

    return X, y, song_files

def create_model(num_classes):
    model = models.Sequential([
        layers.Conv2D(32, (3, 3), activation='relu', input_shape=(N_MELS, None, 1)),
        layers.MaxPooling2D((2, 2)),
        layers.Conv2D(64, (3, 3), activation='relu'),
        layers.MaxPooling2D((2, 2)),
        layers.Conv2D(64, (3, 3), activation='relu'),
        layers.GlobalAveragePooling2D(),
        layers.Dense(64, activation='relu'),
        layers.Dropout(0.5),
        layers.Dense(num_classes, activation='softmax')
    ])
    return model

def main():
    X, y, song_files = create_dataset()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = create_model(len(song_files))
    model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])

    model.fit(X_train, y_train, epochs=50, batch_size=8, validation_data=(X_test, y_test))


    model.save('model')
    os.system('tensorflowjs_converter --input_format keras model model_js')

if __name__ == "__main__":
    main()