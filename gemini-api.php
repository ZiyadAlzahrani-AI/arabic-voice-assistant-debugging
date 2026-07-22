<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function send_json(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$configFile = __DIR__ . '/gemini-config.php';

if (!file_exists($configFile)) {
    send_json(500, [
        'error' => 'ملف gemini-config.php غير موجود. انسخ gemini-config.example.php وغيّر اسمه.'
    ]);
}

require $configFile;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(405, ['error' => 'الطريقة غير مسموحة.']);
}

$contentType = $_SERVER['CONTENT_TYPE'] ?? '';

if (stripos($contentType, 'application/json') === false) {
    send_json(415, ['error' => 'نوع البيانات غير مدعوم.']);
}

$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (!is_array($input)) {
    send_json(400, ['error' => 'بيانات الطلب غير صالحة.']);
}

$prompt = trim((string) ($input['prompt'] ?? ''));

if ($prompt === '') {
    send_json(400, ['error' => 'تحدث أولًا ثم أرسل الطلب.']);
}

if (mb_strlen($prompt, 'UTF-8') > 4000) {
    send_json(400, ['error' => 'النص طويل جدًا.']);
}

if (
    !defined('GEMINI_API_KEY') ||
    GEMINI_API_KEY === '' ||
    GEMINI_API_KEY === 'PUT_YOUR_GEMINI_API_KEY_HERE'
) {
    send_json(500, ['error' => 'ضع مفتاح Gemini داخل gemini-config.php.']);
}

if (!function_exists('curl_init')) {
    send_json(500, ['error' => 'خدمة cURL غير متاحة على الخادم.']);
}

$model = 'gemini-3.5-flash';

$url = sprintf(
    'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s',
    rawurlencode($model),
    rawurlencode(GEMINI_API_KEY)
);

$requestBody = [
    'contents' => [
        [
            'role' => 'user',
            'parts' => [
                ['text' => $prompt]
            ]
        ]
    ],
    'generationConfig' => [
        'temperature' => 0.7,
        'maxOutputTokens' => 700
    ]
];

$ch = curl_init($url);

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode(
        $requestBody,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    ),
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 35,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2
]);

$response = curl_exec($ch);
$curlError = curl_error($ch);
$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

curl_close($ch);

if ($response === false) {
    send_json(502, ['error' => 'تعذر الاتصال بخدمة Gemini: ' . $curlError]);
}

$data = json_decode($response, true);

if (!is_array($data)) {
    send_json(502, ['error' => 'وصل رد غير صالح من Gemini.']);
}

if ($httpCode < 200 || $httpCode >= 300) {
    $apiMessage = $data['error']['message'] ?? 'رفضت خدمة Gemini الطلب.';
    send_json(502, ['error' => $apiMessage]);
}

$reply = trim((string) (
    $data['candidates'][0]['content']['parts'][0]['text'] ?? ''
));

if ($reply === '') {
    send_json(502, ['error' => 'لم تُرجع خدمة Gemini نصًا.']);
}

send_json(200, ['reply' => $reply]);
