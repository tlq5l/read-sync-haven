document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById('email') as HTMLInputElement;
  const saveButton = document.getElementById('saveButton') as HTMLButtonElement;
  const statusElement = document.getElementById('status') as HTMLDivElement;
  
  // Load saved email if available
  chrome.storage.local.get(['userId'], (result) => {
    if (result.userId) {
      emailInput.value = result.userId;
    }
  });
  
  saveButton.addEventListener("click", () => {
    const email = emailInput.value.trim();
    
    if (!email) {
      showStatus('Please enter your email address', 'error');
      return;
    }
    
    // Very basic email validation
    if (!email.includes('@') || !email.includes('.')) {
      showStatus('Please enter a valid email address', 'error');
      return;
    }
    
    // Save the email as userId
    chrome.storage.local.set({ userId: email }, () => {
      showStatus('Settings saved successfully!', 'success');
    });
  });
  
  function showStatus(message: string, type: 'success' | 'error') {
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    statusElement.style.display = 'block';
    
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 3000);
  }
});
