// عناصر الواجهة
const micBtn = document.getElementById("micBtn");
const micIcon = document.getElementById("micIcon");
const chatLog = document.getElementById("chatLog");
const statusText = document.getElementById("statusText");

// اسم ملف PHP المعدّل لتجنب اسم chat المحجوز في InfinityFree
const BACKEND_URL = "gemini-api.php";
const LANG = "ar-SA";

let isListening = false;

const SpeechRecognitionAPI =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognitionAPI) {
  statusText.textContent =
    "متصفحك لا يدعم التعرف على الصوت. استخدم Chrome أو Edge.";
  micBtn.disabled = true;
} else {
  const recognition = new SpeechRecognitionAPI();

  recognition.lang = LANG;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micBtn.addEventListener("click", () => {
    if (isListening) {
      recognition.stop();
      return;
    }

    try {
      recognition.start();
    } catch (error) {
      console.error("تعذر بدء الاستماع:", error);
    }
  });

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add("listening");
    micBtn.setAttribute("aria-label", "إيقاف التحدث");
    micIcon.textContent = "⏹️";
    statusText.textContent = "أستمع الآن... تحدّث";
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove("listening");
    micBtn.setAttribute("aria-label", "بدء التحدث");
    micIcon.textContent = "🎤";
    statusText.textContent = "اضغط على الميكروفون وابدأ الحديث";
  };

  recognition.onerror = (event) => {
    console.error("خطأ التعرف على الصوت:", event.error);

    const messages = {
      "not-allowed": "اسمح للموقع باستخدام الميكروفون ثم حاول مجددًا",
      "no-speech": "لم أسمع كلامًا، حاول مرة أخرى",
      "audio-capture": "تعذر الوصول إلى الميكروفون",
      "network": "حدث خطأ في خدمة التعرف على الصوت"
    };

    statusText.textContent =
      messages[event.error] || "تعذر التعرف على الصوت، حاول مجددًا";
  };

  recognition.onresult = async (event) => {
    const userText = event.results[0][0].transcript.trim();
    if (!userText) return;

    addMessage("user", userText);
    const thinkingElement = addMessage("bot", "يفكر...", true);

    micBtn.disabled = true;
    statusText.textContent = "جارٍ الحصول على الرد...";

    try {
      const reply = await askGemini(userText);
      thinkingElement.remove();
      addMessage("bot", reply);
      speak(reply);
    } catch (error) {
      console.error(error);
      thinkingElement.remove();
      addMessage("bot", error.message || "حدث خطأ أثناء الاتصال بالخادم.");
    } finally {
      micBtn.disabled = false;
      statusText.textContent = "اضغط على الميكروفون وابدأ الحديث";
    }
  };
}

async function askGemini(prompt) {
  const response = await fetch(BACKEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt })
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("الخادم أعاد استجابة غير صالحة.");
  }

  if (!response.ok) {
    throw new Error(data.error || `فشل الطلب برمز ${response.status}`);
  }

  if (!data.reply) {
    throw new Error("لم يصل رد من Gemini.");
  }

  return data.reply;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANG;
  utterance.rate = 1;

  window.speechSynthesis.speak(utterance);
}

function addMessage(role, text, thinking = false) {
  const message = document.createElement("div");
  message.className = `message ${role}${thinking ? " thinking" : ""}`;

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  message.appendChild(paragraph);
  chatLog.appendChild(message);
  chatLog.scrollTop = chatLog.scrollHeight;

  return message;
}
