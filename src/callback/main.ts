// Placeholder callback — replaced by the OAuth exchange in the auth step.
export {};

const statusLine = document.querySelector('.callback-status p');
if (statusLine) {
  statusLine.textContent = 'Farview is not yet connected to Capacities.';
}
