function startAliasGame(words) {
  const container = document.getElementById("game-container");
  let index = 0;
  let timer;

  function showNextWord() {
    if (index >= words.length) {
      showResults();
      return;
    }

    const word = words[index];
    container.innerHTML = `
      <h2>Слово: ${word}</h2>
      <p id="timer">60 секунд</p>
      <button onclick="markGuessed(true)">✅ Отгадано</button>
      <button onclick="markGuessed(false)">❌ Не отгадано</button>
    `;

    startTimer(60);
  }

  function startTimer(seconds) {
    let timeLeft = seconds;
    const timerEl = document.getElementById("timer");

    if (timer) clearInterval(timer); // Очистка предыдущего таймера

    timer = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        clearInterval(timer);
        timerEl.textContent = "Время вышло!";
        index++;
        setTimeout(showNextWord, 1500);
      } else {
        timerEl.textContent = `${timeLeft} секунд`;
      }
    }, 1000);
  }

  window.markGuessed = function(correct) {
    clearInterval(timer);
    index++;
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
