# 08. Замер на Windows-ноутбуке (инструкция для Claude на этом ноутбуке)

Ты — Claude на Windows 10-ноутбуке (8 ГБ). Хозяйка ноутбука помогает проверить сборку игры **Alien Transporter Remaster** (Electron-приложение) и снять цифры производительности. Всё техническое делаешь ты; хозяйка нужна для кликов в окнах Windows (SmartScreen, Брандмауэр) и чтобы **поиграть** (нужны живые нажатия клавиш). Node, npm, Java и исходники **не нужны**: используется готовый установщик.

## Правила

- Работай только в `C:\at-measure` и в папке установки игры. Ничего не меняй в системе сверх шагов ниже.
- **Спрашивай хозяйку** перед установкой, перед запуском игры и до любых изменений настроек Windows. Клики по окнам SmartScreen и Брандмауэра делает **она**, не ты.
- Не отправляй никакие файлы в интернет. Результаты — только в `C:\at-measure\`, хозяйка сама перешлёт их.
- Не выдумывай цифры. Чего не измерили — пиши «не измерено».
- Не получилось дважды подряд — остановись, покажи команду и вывод, спроси хозяйку.

## Что лежит рядом

`Alien Transporter Remaster Setup 0.1.0.exe` (≈233 МБ) — установщик. Хозяйка скажет, где он (флешка/папка). Скопируй его в `C:\at-measure\`.

## Шаг 1. Параметры машины (только чтение)

В PowerShell:
```powershell
New-Item -ItemType Directory -Force C:\at-measure | Out-Null
Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors
Get-CimInstance Win32_ComputerSystem | Select-Object @{n='RAM_GB';e={[math]::Round($_.TotalPhysicalMemory/1GB,1)}}
Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion
(Get-CimInstance Win32_OperatingSystem).Caption
```
Запиши вывод в отчёт. Закрой тяжёлые программы (браузер с кучей вкладок и т.п.) — попроси хозяйку; запиши, что осталось открытым.

## Шаг 2. Установка

1. Спроси хозяйку разрешение, запусти установщик `C:\at-measure\Alien Transporter Remaster Setup 0.1.0.exe`.
2. Windows покажет синее окно SmartScreen: **хозяйка** нажимает «Подробнее» → «Выполнить в любом случае» (сборка не подписана).
3. Установи с настройками по умолчанию. Найди установленный exe (обычно ярлык «Alien Transporter Remaster» на рабочем столе/в меню Пуск; путь смотри у ярлыка: `(New-Object -ComObject WScript.Shell).CreateShortcut("<путь к .lnk>").TargetPath`). Запомни путь как `$exe`.

## Шаг 3. Замер, Level11

Запусти игру сразу на уровне, с тиром 2x и логом производительности (путь лога **абсолютный**):
```powershell
$exe = "<путь к Alien Transporter Remaster.exe>"
Start-Process -FilePath $exe -ArgumentList '--start-level=Level11','--tier=2x','--perf-log=C:\at-measure\perf-l11.json'
```
Если игра открылась в главном меню, а не на уровне — флаг не сработал: выбери Level 11 в меню (хозяйка), лог при этом всё равно пишется (потом в отчёте отметь «меню попало в замер»).

Хозяйка **играет 90 секунд**: активно летает, жжёт топливо, взрывает бочки, сажает пассажиров. Если есть второй игрок — пусть нажмёт **W** (входит второй игрок на этом же ноутбуке) и тоже летает. Замер идёт сам, раз в секунду.

Пока играет, **один раз** попроси её нажать **F3** (оверлей производительности) и прочитай/сфотографируй/перепиши строки: FPS, tier, vram, ram. Нужно подтвердить, что tier = **2x**. Потом F3 ещё раз — убрать.

Через 90 секунд попроси закрыть игру. Файл `C:\at-measure\perf-l11.json` пишется атомарно после каждой строки, ничего специально сохранять не надо.

## Шаг 4. Замер, Level13

То же самое:
```powershell
Start-Process -FilePath $exe -ArgumentList '--start-level=Level13','--tier=2x','--perf-log=C:\at-measure\perf-l13.json'
```
Хозяйка играет 90 секунд (ракеты, сенсоры, летать активно, W для второго игрока по желанию). Закрыть игру.

## Шаг 5. Прочитать цифры

Node не нужен, читай через PowerShell:
```powershell
foreach ($f in 'perf-l11','perf-l13') {
  $j = Get-Content "C:\at-measure\$f.json" -Raw | ConvertFrom-Json
  "== $f =="; $j.meta | Format-List; $j.summary | ConvertTo-Json -Depth 5
  "записей: " + $j.entries.Count
}
```
В `summary` смотри: `fps`, `tickP95`, `ramMB`, `vramMB` (у каждого `min/mean/max`). Сравни с бюджетами Windows (тир 2x):

| Метрика | Бюджет |
|---|---|
| FPS | стабильно 60 (min не должен проваливаться заметно ниже) |
| Тик симуляции p95 | ≤ 4 мс |
| RAM всего приложения | ≤ 700 МБ |
| VRAM (оценка) | ≤ 350 МБ |

Если в `entries` первые секунды — загрузка уровня, это нормально; не выкидывай их молча, но отметь, что именно.

## Шаг 6. Улики по «белому экрану» (только чтение, ничего не менять)

Хозяйка видела, что при долгой сетевой игре окно иногда становится белым и не отвечает. Собери факты, чтобы помочь найти причину:
```powershell
# события падений приложения за последние 14 дней (Application Error / .NET / WER)
Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddDays(-14)} -ErrorAction SilentlyContinue |
  Where-Object { $_.Message -match 'Alien Transporter|electron' } |
  Select-Object TimeCreated,Id,ProviderName,@{n='Msg';e={$_.Message.Substring(0,[math]::Min(300,$_.Message.Length))}}
# что лежит в папке данных игры (только имена и даты; содержимое файлов не читай и не отправляй)
Get-ChildItem "$env:APPDATA\Alien Transporter Remaster" -Recurse -Depth 2 -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'log|crash|dmp|report' } | Select-Object FullName,Length,LastWriteTime
```
(Также `%LOCALAPPDATA%\CrashDumps`, если папка есть.) Запиши, что нашлось; **пустой результат — тоже результат**. Спроси хозяйку: бывало ли так в одиночной игре или только по сети; на хосте или на клиенте; примерно через сколько минут; что делала (сворачивала окно, ноутбук от батареи, выключался экран). Запиши её ответы дословно.

## Шаг 7. Отчёт

Создай `C:\at-measure\REPORT.md` и покажи хозяйке. Она перешлёт его вместе с `perf-l11.json` и `perf-l13.json`.

```markdown
# Замер Windows: Alien Transporter Remaster 0.1.0

Дата: …
## Машина
(вывод шага 1; что было открыто в фоне)
## Установка
Установщик прошёл: да/нет; SmartScreen: …; путь установки: …
## Level11 (тир 2x, 90 с, игроков: 1/2)
- tier по F3: …   FPS min/mean/max: …   tickP95: …   RAM max: … МБ   VRAM max: … МБ
- Попал ли в замер экран меню: да/нет
- Заметные рывки/лаги на глаз: …
## Level13 (то же)
…
## Бюджет
FPS 60: ок/нет · тик p95 ≤ 4 мс: ок/нет · RAM ≤ 700 МБ: ок/нет · VRAM ≤ 350 МБ: ок/нет
## Белый экран: улики
- Журнал Windows: …
- Файлы crash/dmp: …
- Ответы хозяйки: …
## Проблемы и наблюдения
…
```
