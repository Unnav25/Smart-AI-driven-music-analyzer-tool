class AudioProcessor {
    constructor() {
        this.modelInfo = null;
        this.model = null;
        this.songsData = null;
        this.isInitialized = false;
        this.audioContext = null;
        this.hannWindow = null;
    }

   async initialize() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const infoResponse = await fetch('model_web/model_info.json');
            this.modelInfo = await infoResponse.json();
            console.log('Model info loaded:', this.modelInfo);
            const songsResponse = await fetch('songs.json');
            this.songsData = await songsResponse.json();
            console.log('Songs data loaded:', this.songsData.length, 'songs');
            this.createHannWindow();
            this.model = await tf.loadGraphModel('model_web/tfjs_model/model.json');
            console.log('Model loaded successfully');
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Error initializing audio processor:', error);
            return false;
        }
    }
    
     
    createHannWindow() {
        const length = this.modelInfo.n_fft;
        const buffer = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            buffer[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
        }
        this.hannWindow = tf.tensor1d(buffer);
    }


    async processAudio(audioBlob) {
        if (!this.isInitialized) {
            throw new Error('AudioProcessor not initialized');
        }
        
        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Convert to mel spectrogram
            const melSpec = await this.audioToMel(audioBuffer);
            
            // Predict with model
            const prediction = await this.predict(melSpec);
            
            return prediction;
        } catch (error) {
            console.error('Error processing audio:', error);
            throw error;
        }
    }
    

    async audioToMel(audioBuffer) {
        
        const audioData = audioBuffer.getChannelData(0);
        
        // Resample if needed
        let resampledData = audioData;
        if (audioBuffer.sampleRate !== this.modelInfo.sample_rate) {
            const resampleRatio = this.modelInfo.sample_rate / audioBuffer.sampleRate;
            resampledData = new Float32Array(Math.floor(audioData.length * resampleRatio));
            for (let i = 0; i < resampledData.length; i++) {
                resampledData[i] = audioData[Math.floor(i / resampleRatio)];
            }
        }
        
        // Limit to expected duration
        const expectedLength = this.modelInfo.sample_rate * this.modelInfo.duration;
        let processedData;
        if (resampledData.length > expectedLength) {
            processedData = resampledData.slice(0, expectedLength);
        } else {
            processedData = new Float32Array(expectedLength);
            processedData.set(resampledData);
        }
        
    
        const tensor = tf.tensor1d(processedData);
        
        
        const stft = tf.signal.stft(
            tensor,
            this.modelInfo.n_fft,
            this.modelInfo.hop_length,
            undefined,
            this.hannWindow
        );
        

        const magnitudes = tf.abs(stft);
        

        const melBasis = tf.linspace(0, 1, this.modelInfo.n_mels).reshape([this.modelInfo.n_mels, 1]);
        const melSpec = tf.matMul(melBasis, magnitudes);
        

        const logMelSpec = tf.log(melSpec.add(1e-6));
        const normalized = tf.div(
            tf.sub(logMelSpec, tf.min(logMelSpec)),
            tf.sub(tf.max(logMelSpec), tf.min(logMelSpec))
        );
        
        // Reshape to expected model input format
        return normalized.expandDims(0).expandDims(-1);
    }
    
    /**
     * Run prediction with the model
     */
    async predict(melSpec) {
        try {
            // Run inference
            const output = await this.model.predict(melSpec);
            const probabilities = await output.data();
            
            // Find the song with highest probability
            const songIndex = probabilities.indexOf(Math.max(...probabilities));
            const confidence = probabilities[songIndex];
            
            // Return song info with confidence
            return {
                song: this.songsData[songIndex],
                confidence: confidence
            };
        } catch (error) {
            console.error('Prediction error:', error);
            throw error;
        }
    }
}

// Export the processor
window.AudioProcessor = AudioProcessor; 