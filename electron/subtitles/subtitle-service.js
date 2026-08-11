const { YoutubeIProvider } = require('./youtubei-provider');
const { YoutubeTranscriptProvider } = require('./youtube-transcript-provider');
const { YtDlpProvider } = require('./ytdlp-provider');

class SubtitleService {
  constructor() {
    this.providers = [
      new YoutubeIProvider(),
      new YoutubeTranscriptProvider(),
      new YtDlpProvider()
    ];
  }

  /**
   * Extract video ID from YouTube URL or return as-is if already an ID.
   * @param {string} urlOrId 
   * @returns {string}
   */
  extractVideoId(urlOrId) {
    if (urlOrId.length === 11 && !urlOrId.includes('/')) {
      return urlOrId;
    }
    const match = urlOrId.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:\?|&|\/|$)/);
    return match ? match[1] : urlOrId;
  }

  /**
   * Retrieves subtitles using a fallback chain strategy.
   * @param {string} videoUrl 
   * @returns {Promise<import('./types').TranscriptResult>}
   */
  async getSubtitles(videoUrl) {
    const videoId = this.extractVideoId(videoUrl);
    const errors = [];

    for (const provider of this.providers) {
      try {
        console.log(`[SubtitleService] Attempting to fetch subtitles with ${provider.name} for ${videoId}`);
        const result = await provider.getTranscript(videoId);
        console.log(`[SubtitleService] Successfully fetched subtitles with ${provider.name}`);
        return result;
      } catch (err) {
        console.warn(`[SubtitleService] Provider ${provider.name} failed: ${err.message}`);
        errors.push(`${provider.name}: ${err.message}`);
        // Continue to the next provider
      }
    }

    throw new Error(`All subtitle providers failed for ${videoId}:\n${errors.join('\n')}`);
  }
}

// Export a singleton instance
module.exports = new SubtitleService();
