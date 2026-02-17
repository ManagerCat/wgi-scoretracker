import fs from "fs";

async function writeSchedule(circuit, scheduleObj) {
  return new Promise((resolve, reject) => {
    fs.readFile("./schedules.json", "utf8", (err, data) => {
      if (err) {
        console.error("Error reading schedule file:", err);
        return;
      }
      data = JSON.parse(data);
      data[circuit] = scheduleObj;
      data = JSON.stringify(data);
      fs.writeFile("schedules.json", data, (err) => {
        if (err) {
          console.error("Error writing schedule to file:", err);
          reject(err);
        } else {
          console.log("Schedule written to file successfully.");
          resolve();
        }
      });
    });
  });
}

export default writeSchedule;
