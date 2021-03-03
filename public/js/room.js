
const socket = io.connect()

socket.on("connect", function() {
    if(isAdmin != "false") {
        socket.emit("createRoom", {username: username, room: room})
    } else {
        socket.emit("joinRoom", {username: username, room: room})
    }

    socket.on("joinFailure", function() {
        window.location.replace("http://localhost:3000/");
    })
    
    socket.on("joinSuccess", data => {
        roomId.innerHTML = data.room
    })

    socket.on("dissolveRoom", function() {
        window.location.replace("http://localhost:3000/");
    })
    
    socket.on("updateUsers", data => {
        usersList.innerHTML = ""

        data.users.forEach(user => {
            let li = document.createElement('li')
            li.setAttribute("class", "user list-group-item")
            li.appendChild(document.createTextNode(user))
            usersList.appendChild(li)
        });
    })

    socket.on("updateBuzzer", data => {
        let buzzerObj = data.buzzer

        if(buzzer) {
            if(buzzerObj.locked) {
                buzzer.disabled = true
            } else {
                buzzer.disabled = false
            }
        }

        users = Array.from(document.getElementsByClassName("user"))

        users.forEach(user => {
            if (buzzerObj.currentBuzz.some((a) => a[0] == user.textContent)) {
                user.setAttribute("class", "user list-group-item list-group-item-warning")
            } else if (buzzerObj.buzzWinner.includes(user.textContent)) {
                user.setAttribute("class", "user list-group-item list-group-item-success")
            } else if (buzzerObj.buzzed.some((a) => a[0] == user.textContent)) {
                user.setAttribute("class", "user list-group-item list-group-item-danger")
            } else {
                user.setAttribute("class", "user list-group-item")
            }
        })

        if(buzzerObj.currentBuzz.some((a) => a[0] == username) || buzzerObj.buzzed.some((a) => a[0] == username)) {
            if(buzzer) {
                buzzer.disabled = true
            }
        }
    })

    let roomId = document.querySelector("#room-id")
    let usersList = document.querySelector("#users")
    let buzzer = document.querySelector("#buzzer")
    let resetBuzzer = document.querySelector('#buzzer-reset')
    let unlockBuzzer = document.querySelector('#buzzer-unlock')
    
    if(buzzer) {
        buzzer.addEventListener("click", function() {
            socket.emit("buzz", {time: new Date().getTime()})
        })
    }

    if(resetBuzzer) {
        resetBuzzer.addEventListener("click", function() {
            socket.emit("resetBuzzer", {time: new Date().getTime()})
        })
    }

    if(unlockBuzzer) {
        unlockBuzzer.addEventListener("click", function() {
            socket.emit("unlockBuzzer", {time: new Date().getTime()})
        })
    }
})