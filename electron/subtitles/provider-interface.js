/**
 * Base interface/class for subtitle providers.
 */
class SubtitleProvider {
  /**
   * Get the provider's name.
   * @returns {string}
   */
  get name() {
    throw new Error('Not implemented');
  }

  /**
   * Retrieve transcript for a video ID.
   * @param {string} videoId 
   * @returns {Promise<import('./types').TranscriptResult>}
   */
  async getTranscript(videoId) {
    throw new Error('Not implemented');
  }
}

module.exports = { SubtitleProvider };
