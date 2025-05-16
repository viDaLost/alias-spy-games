let currentIndex = 0;
let guessedWords = [];

function startAliasGame(words) {
  const container = document.getElementById("game-container");

  function showNextWord() {
    if (currentIndex >= words.length) {
      showResults();
      return;
    }

    const word = words[currentIndex];
    container.innerHTML = `
      <h2>Слово: ${word}</h2>
      <p>Объясните, не называя!</p>
      <div class="timer">60 секунд</div>
      <button onclick="markGuessed(true)">✅ Отгадано</button>
      <button onclick="markGuessed(false)">❌ Не отгадано</button>
    `;

    startTimer(60, () => {
      guessedWords.push({ word, correct: false });
      currentIndex++;
      showNextWord();
    });
  }

  window.markGuessed = function(correct) {
    guessedWords.push({ word: words[currentIndex], correct });
    currentIndex++;
    showNextWord();
  };

  function showResults() {
    container.innerHTML = "<h2>Результаты:</h2><ul>";
    guessedWords.forEach(item => {
      const color = item.correct ? "green" : "red";
      container.innerHTML += `<li style="color:${color}">${item.word}</li>`;
    });
    container.innerHTML += "</ul>";
    container.innerHTML += '<button onclick="startAliasGame(words)">Начать заново</button>';
  }

  function startTimer(seconds, callback) {
    let timeLeft = seconds;
    const timerEl = document.createElement("div");
    timerEl.className = "timer";
    timerEl.textContent = `${timeLeft} секунд`;
    container.appendChild(timerEl);

    const interval = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        clearInterval(interval);
        callback();
      } else {
        timerEl.textContent = `${timeLeft} секунд`;
      }
    }, 1000);
  }

  showNextWord();
}
