function startAliasGame(words) {
  const container = document.getElementById("game-container");
  let currentIndex = 0;

  function showNextWord() {
    if (currentIndex >= words.length) {
      showResults();
      return;
    }

    const word = words[currentIndex];
    container.innerHTML = `
      <h2>Слово: ${word}</h2>
      <p>Объясните, не называя!</p>
      <button onclick="markGuessed(true)">✅ Отгадано</button>
      <button onclick="markGuessed(false)">❌ Не отгадано</button>
    `;
  }

  window.markGuessed = function(correct) {
    currentIndex++;
    showNextWord();
  };

  function showResults() {
    container.innerHTML = "<h2>Результаты:</h2><ul>";
    words.forEach(word => {
      container.innerHTML += `<li>${word}</li>`;
    });
    container.innerHTML += "</ul>";
    container.innerHTML += `<button onclick="startAliasGame(words)">🔄 Новая игра</button>`;
    container.innerHTML += `<button onclick="goToMainMenu()" style="margin-left:10px;">🏠 Главное меню</button>`;
  }

  showNextWord();
}
