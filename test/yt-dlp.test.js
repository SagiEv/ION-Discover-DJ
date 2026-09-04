const youtubedl = require('youtube-dl-exec');
const fs = require('fs');

async function testYtDlp() {
  const outputFile = 'test-exec-music.webm';
  
  // Clean up if exists
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }

  try {
    console.log('Testing yt-dlp download on a music video...');
    await youtubedl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      format: 'bestaudio[ext=webm]',
      output: outputFile,
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      ]
    });
    
    if (fs.existsSync(outputFile)) {
      console.log('✅ yt-dlp download successful!');
      fs.unlinkSync(outputFile);
      process.exit(0);
    } else {
      console.error('❌ Download finished but file not found.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ yt-dlp error:', err.stderr || err.message || err);
    process.exit(1);
  }
}

testYtDlp();
