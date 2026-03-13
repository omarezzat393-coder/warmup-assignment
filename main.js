const fs = require("fs");


function parseClockTime(timeStr) {
  timeStr = timeStr.trim().toLowerCase();

  let parts = timeStr.split(" ");
  let time = parts[0];
  let period = parts[1];

  let hms = time.split(":");
  let h = Number(hms[0]);
  let m = Number(hms[1]);
  let s = Number(hms[2]);

  if (period === "am") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }

  return h * 3600 + m * 60 + s;
}

function parseDuration(str) {
  let parts = str.trim().split(":");
  let h = Number(parts[0]);
  let m = Number(parts[1]);
  let s = Number(parts[2]);
  return h * 3600 + m * 60 + s;
}

function formatDuration(totalSeconds) {
  if (totalSeconds < 0) totalSeconds = 0;

  let h = Math.floor(totalSeconds / 3600);
  let m = Math.floor((totalSeconds % 3600) / 60);
  let s = totalSeconds % 60;

  return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function getShiftDuration(startTime, endTime) {
  let start = parseClockTime(startTime);
  let end = parseClockTime(endTime);

  let diff = end - start;
  if (diff < 0) diff += 24 * 3600;

  return formatDuration(diff);
}

function getIdleTime(startTime, endTime) {
  let start = parseClockTime(startTime);
  let end = parseClockTime(endTime);

  let deliveryStart = 8 * 3600;   // 8:00 AM
  let deliveryEnd = 22 * 3600;    // 10:00 PM

  let idle = 0;

  if (start < deliveryStart) {
    idle += Math.min(end, deliveryStart) - start;
  }

  if (end > deliveryEnd) {
    idle += end - Math.max(start, deliveryEnd);
  }

  return formatDuration(idle);
}

function getActiveTime(shiftDuration, idleTime) {
  let shift = parseDuration(shiftDuration);
  let idle = parseDuration(idleTime);
  return formatDuration(shift - idle);
}

function metQuota(date, activeTime) {
  let active = parseDuration(activeTime);

  let quota;
  if (date >= "2025-04-10" && date <= "2025-04-30") {
    quota = 6 * 3600;
  } else {
    quota = 8 * 3600 + 24 * 60;
  }

  return active >= quota;
}

function addShiftRecord(textFile, shiftObj) {
  let content = "";
  if (fs.existsSync(textFile)) {
    content = fs.readFileSync(textFile, "utf8").trim();
  }

  let lines = content === "" ? [] : content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    let parts = lines[i].split(",");
    let driverID = parts[0].trim();
    let date = parts[2].trim();

    if (driverID === shiftObj.driverID && date === shiftObj.date) {
      return {};
    }
  }

  let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
  let idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
  let activeTime = getActiveTime(shiftDuration, idleTime);
  let quota = metQuota(shiftObj.date, activeTime);

  let newObj = {
    driverID: shiftObj.driverID,
    driverName: shiftObj.driverName,
    date: shiftObj.date,
    startTime: shiftObj.startTime,
    endTime: shiftObj.endTime,
    shiftDuration: shiftDuration,
    idleTime: idleTime,
    activeTime: activeTime,
    metQuota: quota,
    hasBonus: false
  };

  let newLine =
    newObj.driverID + "," +
    newObj.driverName + "," +
    newObj.date + "," +
    newObj.startTime + "," +
    newObj.endTime + "," +
    newObj.shiftDuration + "," +
    newObj.idleTime + "," +
    newObj.activeTime + "," +
    newObj.metQuota + "," +
    newObj.hasBonus;

  let lastIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    let parts = lines[i].split(",");
    if (parts[0].trim() === shiftObj.driverID) {
      lastIndex = i;
    }
  }

  if (lastIndex === -1) {
    lines.push(newLine);
  } else {
    lines.splice(lastIndex + 1, 0, newLine);
  }

  fs.writeFileSync(textFile, lines.join("\n"));
  return newObj;
}

function setBonus(textFile, driverID, date, newValue) {
  let content = fs.readFileSync(textFile, "utf8").trim();
  let lines = content === "" ? [] : content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    let parts = lines[i].split(",");

    if (parts[0].trim() === driverID && parts[2].trim() === date) {
      parts[9] = String(newValue);
      lines[i] = parts.join(",");
      break;
    }
  }

  fs.writeFileSync(textFile, lines.join("\n"));
}

function countBonusPerMonth(textFile, driverID, month) {
  let content = fs.readFileSync(textFile, "utf8").trim();
  let lines = content === "" ? [] : content.split("\n");

  month = Number(month);

  let foundDriver = false;
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    let parts = lines[i].split(",");

    let id = parts[0].trim();
    let date = parts[2].trim();
    let hasBonus = parts[9].trim() === "true";

    if (id === driverID) {
      foundDriver = true;

      let fileMonth = Number(date.split("-")[1]);
      if (fileMonth === month && hasBonus) {
        count++;
      }
    }
  }

  if (!foundDriver) return -1;
  return count;
}

function getTotalActiveHoursPerMonth(textFile, driverID, month) {
  let content = fs.readFileSync(textFile, "utf8").trim();
  let lines = content === "" ? [] : content.split("\n");

  let total = 0;
  month = Number(month);

  for (let i = 0; i < lines.length; i++) {
    let parts = lines[i].split(",");

    let id = parts[0].trim();
    let date = parts[2].trim();
    let activeTime = parts[7].trim();

    if (id === driverID && Number(date.split("-")[1]) === month) {
      total += parseDuration(activeTime);
    }
  }

  return formatDuration(total);
}

function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
  let shiftsContent = fs.readFileSync(textFile, "utf8").trim();
  let shiftLines = shiftsContent === "" ? [] : shiftsContent.split("\n");

  let ratesContent = fs.readFileSync(rateFile, "utf8").trim();
  let rateLines = ratesContent === "" ? [] : ratesContent.split("\n");

  month = Number(month);

  let dayOff = "";

  for (let i = 0; i < rateLines.length; i++) {
    let parts = rateLines[i].split(",");
    if (parts[0].trim() === driverID) {
      dayOff = parts[1].trim();
      break;
    }
  }

  let total = 0;
  let days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  for (let i = 0; i < shiftLines.length; i++) {
    let parts = shiftLines[i].split(",");

    let id = parts[0].trim();
    let date = parts[2].trim();

    if (id === driverID && Number(date.split("-")[1]) === month) {
      let d = new Date(date + "T00:00:00");
      let dayName = days[d.getDay()];

      if (dayName !== dayOff) {
        if (date >= "2025-04-10" && date <= "2025-04-30") {
          total += 6 * 3600;
        } else {
          total += 8 * 3600 + 24 * 60;
        }
      }
    }
  }

  total -= bonusCount * 2 * 3600;
  if (total < 0) total = 0;

  return formatDuration(total);
}


function getNetPay(driverID, actualHours, requiredHours, rateFile) {
  let content = fs.readFileSync(rateFile, "utf8").trim();
  let lines = content === "" ? [] : content.split("\n");

  let basePay = 0;
  let tier = 0;

  for (let i = 0; i < lines.length; i++) {
    let parts = lines[i].split(",");
    if (parts[0].trim() === driverID) {
      basePay = Number(parts[2].trim());
      tier = Number(parts[3].trim());
      break;
    }
  }

  let actual = parseDuration(actualHours);
  let required = parseDuration(requiredHours);

  if (actual >= required) return basePay;

  let missing = required - actual;

  let allowed = 0;
  if (tier === 1) allowed = 50;
  else if (tier === 2) allowed = 20;
  else if (tier === 3) allowed = 10;
  else if (tier === 4) allowed = 3;

  missing -= allowed * 3600;

  if (missing <= 0) return basePay;

  let fullMissingHours = Math.floor(missing / 3600);
  if (fullMissingHours <= 0) return basePay;

  let deductionRatePerHour = Math.floor(basePay / 185);
  let salaryDeduction = fullMissingHours * deductionRatePerHour;

  return basePay - salaryDeduction;
}

module.exports = {
  getShiftDuration,
  getIdleTime,
  getActiveTime,
  metQuota,
  addShiftRecord,
  setBonus,
  countBonusPerMonth,
  getTotalActiveHoursPerMonth,
  getRequiredHoursPerMonth,
  getNetPay
};