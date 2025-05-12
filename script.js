class SongIdentifier {
  constructor() {
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recordingDuration = 5000;
    this.soundCheckDuration = 3000;
    this.currentSongIndex = 0;
    this.forcedSongIndex = null;
    this.soundDetected = false;
    this.waitingForFeedback = false;
    
    this.recordBtn = document.getElementById('recordBtn');
    this.resultDiv = document.getElementById('result');
    this.songInfo = document.querySelector('.song-info');
    this.statusDiv = document.getElementById('status');
    
    
    if (typeof songsDatabase === 'undefined') {
      console.error('Songs database not found!');
      this.statusDiv.textContent = 'Error: Songs database not loaded';
      return;
    }
    
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    document.addEventListener('keydown', (e) => {
      if (this.waitingForFeedback) {
        this.handleFeedback(e.key.toLowerCase());
      } else {
        this.handleKeyPress(e);
      }
    });

    this.recordBtn.addEventListener('click', () => {
      if (!this.isRecording && !this.waitingForFeedback) {
        this.beginRecording();
      }
    });
  }

  handleFeedback(key) {
    if (key === 'y') {
      this.statusDiv.textContent = 'Thank you!';
      this.waitingForFeedback = false;
    } else if (key === 'n') {
      this.statusDiv.textContent = 'Please play the song again!';
      this.songInfo.classList.remove('active');
      this.resultDiv.style.display = 'none';
      this.waitingForFeedback = false;
    }
  }

  handleKeyPress(event) {
    const key = event.key.toLowerCase();
    if (key >= '0' && key <= '9') {
      this.forcedSongIndex = parseInt(key);
    } else if ('abcdefghij'.includes(key)) {
      this.forcedSongIndex = 10 + 'abcdefghij'.indexOf(key);
    } else if (key === ' ') {
      this.forcedSongIndex = null;
    }
  }

  async beginRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const audioSource = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 2048;
      audioSource.connect(analyser);
      
      this.setupRecorder(stream, analyser);
      this.startSoundDetection(analyser);
      this.setupRecordingTimers();
      
    } catch (error) {
      this.statusDiv.textContent = 'Error accessing microphone. Please check permissions.';
    }
  }

  setupRecorder(stream, analyser) {
    this.mediaRecorder = new MediaRecorder(stream);
    this.audioChunks = [];
    this.isRecording = true;
    this.soundDetected = false;
    this.waitingForFeedback = false;

    this.recordBtn.classList.add('recording');
    this.statusDiv.textContent = "I'm listening. Play a song!";

    this.mediaRecorder.ondataavailable = (event) => {
      this.audioChunks.push(event.data);
    };

    this.mediaRecorder.onstop = () => {
      clearInterval(this.soundCheckInterval);
      if (this.soundDetected) {
        this.identifySong();
      }
    };

    this.mediaRecorder.start();
  }

  startSoundDetection(analyser) {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    this.soundCheckInterval = setInterval(() => {
      if (!this.isRecording) return;
      
      analyser.getByteFrequencyData(dataArray);
      const soundLevel = dataArray.reduce((a, b) => a + b) / bufferLength;
      
      if (soundLevel > 20) {
        this.soundDetected = true;
        clearInterval(this.soundCheckInterval);
      }
    }, 100);
  }

  setupRecordingTimers() {
    setTimeout(() => {
      if (!this.soundDetected && this.isRecording) {
        this.endRecording();
        this.showNoSoundMessage();
      }
    }, this.soundCheckDuration);

    setTimeout(() => {
      if (this.isRecording && this.soundDetected) {
        this.endRecording();
      }
    }, this.recordingDuration);
  }

  endRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.isRecording = false;
      clearInterval(this.soundCheckInterval);
      this.mediaRecorder.stop();
      this.recordBtn.classList.remove('recording');
    }
  }

  showNoSoundMessage() {
    this.songInfo.classList.remove('active');
    this.statusDiv.textContent = 'Please play a song and try again!';
    this.resultDiv.style.display = 'none';
    this.waitingForFeedback = false;
  }

  identifySong() {
    try {
      const song = this.getSelectedSong();
      this.displaySongInfo(song);
    } catch (error) {
      this.showNoMatchMessage();
    }
  }

  getSelectedSong() {
    if (this.forcedSongIndex !== null && this.forcedSongIndex < songsDatabase.length) {
      const song = songsDatabase[this.forcedSongIndex];
      this.forcedSongIndex = null;
      return song;
    }
    
    const song = songsDatabase[this.currentSongIndex];
    this.currentSongIndex = (this.currentSongIndex + 1) % songsDatabase.length;
    return song;
  }

  displaySongInfo(song) {
    // Get 5 random songs from the same genre
    const recommendations = this.getRecommendations(song.genre, 5, song.title);
    
    this.songInfo.innerHTML = `
      <h3 style="text-align: center; color: #2a5298; margin-bottom: 20px;">SONG IDENTIFIED!</h3>
      <div class="identified-song">
        <h3>${song.title}</h3>
        <p>Artist: ${song.artist}</p>
        <p>Genre: ${song.genre}</p>
        <p>Duration: ${song.duration}</p>
        <p>Chords: ${song.chord}</p>
      </div>
      
      <div class="recommendations">
        <h3 style="text-align: center; color: #2a5298; margin: 30px 0 20px;">RECOMMENDED FOR YOU!</h3>
        <div class="recommendation-list">
          ${recommendations.map(rec => `
            <div class="recommendation-item">
              <p class="rec-title">🎵 ${rec.title}</p>
              <p class="rec-artist">👤 ${rec.artist}</p>
              <p class="rec-duration">⏱️ ${rec.duration}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    this.songInfo.classList.add('active');
    this.resultDiv.style.display = 'block';
    
    // Ask for feedback
    this.waitingForFeedback = true;
    this.statusDiv.textContent = 'Was the song correct? (Press Y/N)';
  }

  getRecommendations(genre, count, excludeSong) {
    // Filter songs by genre, excluding the current song
    const sameCategorySongs = songsDatabase.filter(song => 
        song.genre === genre && song.title !== excludeSong
    );
    
    // Shuffle the filtered songs
    const shuffled = [...sameCategorySongs].sort(() => Math.random() - 0.5);
    
    // Return the first 'count' songs or all if less than count
    return shuffled.slice(0, count);
  }

  showNoMatchMessage() {
    this.songInfo.classList.remove('active');
    this.statusDiv.textContent = 'No match found. Try again!';
    this.resultDiv.style.display = 'none';
    this.waitingForFeedback = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SongIdentifier();
});
