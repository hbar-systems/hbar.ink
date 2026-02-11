/**
 * Downloads a text file with the specified content
 * 
 * @param filename The name of the file to download
 * @param content The content of the file
 * @param mimeType The MIME type of the file (defaults to 'text/plain')
 */
export function downloadTextFile(filename: string, content: string, mimeType: string = 'text/plain'): void {
  // Only run in browser environment
  if (typeof window === 'undefined') {
    console.warn('downloadTextFile can only be used in browser environment')
    return
  }
  
  try {
    // Create a blob with the file content
    const blob = new Blob([content], { type: mimeType })
    
    // Create a URL for the blob
    const url = URL.createObjectURL(blob)
    
    // Create a temporary anchor element
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    
    // Append to the document, click, and remove
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    
    // Clean up the URL object
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error downloading file:', error)
  }
}
