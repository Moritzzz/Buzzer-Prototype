// Initialize client socket instance
const socket = io.connect()

socket.on("connect", function() {
    // if the client is an admin, we want to create a room server side, otherwise, we want to join a room
    if(isAdmin != "false") {
        socket.emit("createRoom", {username: username, room: room})
    } else {
        socket.emit("joinRoom", {username: username, room: room})
    }

    // handle join failures and successes
    socket.on("joinFailure", function() {
        window.location.replace("http://buzzer-prototype.herokuapp.com/");
    })
    
    socket.on("joinSuccess", data => {
        roomId.innerHTML = data.room
    })

    // redirect when a room gets disolved
    socket.on("dissolveRoom", function() {
        window.location.replace("http://buzzer-prototype.herokuapp.com/");
    })
    
    // update the users list to reflect the database
    socket.on("updateUsers", data => {
        usersList.innerHTML = ""

        data.users.forEach(user => {
            let li = document.createElement('li')
            li.setAttribute("class", "user list-group-item")
            li.appendChild(document.createTextNode(user))
            usersList.appendChild(li)
        });
    })

    // update the visual representation of the buzzer state based on the databse object
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

        // for each user in the user list, determine which part of the buzzer they are involved in, and color based on that
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

        // if the user has already buzzed, we want the button locked
        if(buzzerObj.currentBuzz.some((a) => a[0] == username) || buzzerObj.buzzed.some((a) => a[0] == username)) {
            if(buzzer) {
                buzzer.disabled = true
            }
        }
    })

    // html elements
    let roomId = document.querySelector("#room-id")
    let usersList = document.querySelector("#users")
    let buzzer = document.querySelector("#buzzer")
    let resetBuzzer = document.querySelector('#buzzer-reset')
    let unlockBuzzer = document.querySelector('#buzzer-unlock')
    
    // event listeners for the various buttons
    if(buzzer) {
        buzzer.addEventListener("click", function() {
            socket.emit("buzz", {time: new Date().getTime()})
        })
        
        document.addEventListener("keydown", (e) => {
            if(e.key == "Spacebar") {
                socket.emit("buzz", {time: new Date().getTime()})
            }
        })
    }

    if(resetBuzzer) {
        resetBuzzer.addEventListener("click", function() {
            socket.emit("resetBuzzer")
        })
    }

    if(unlockBuzzer) {
        unlockBuzzer.addEventListener("click", function() {
            socket.emit("unlockBuzzer")
        })
    }
})
