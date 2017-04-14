function CreateReplayVideo(title, player, filename, gametype, autohilyte){
    console.log(userid);
    console.log(filename);
    console.log(player);
    var replayid = null;
    var hilyter = DecodeAutohilyteMode(autohilyte);
    
    hapi.get("replays", "id,state,filename", {users: userid, state: "none"}, function(err, data)
    {
    if (err == null) {
        console.log(data);
        for (var i = 0; i < data.length; i++) {
            if (data[i].filename == filename) {
                replayid = data[i].id;
            }
        }
        if (replayid == null) {
            alert("no valid replay file");
        } else {
            console.log(replayid);
            hapi.put("replays/" + replayid, "id,state", {title: JSON.stringify(title), player: JSON.stringify(player), state: "uploaded", type: gametype, autohilyte: hilyter}, function(err, data)
            {
            if (err == null) {
                console.log(data);
                hapi.batch(
                [
                    {name: "al", method:"GET", path: "users/" + userid + "/albums", body: {fields: "id,name,content", name: "My Replays", content: "replays", type: "album"} },
                    {ifempty: '$al$', name: "cl", method:"POST", path: "users/" + userid + "/albums", body: {fields: "id,name,content", name: "My Replays", content: "replays", type: "album", privacy: "public"} }
                ], function(err, data)
                {
                    if (err == null) {
                        console.log(data);
                        if ((data[0].body != null) && (data[0].body.length > 0)){
                            if ("id" in data[0].body[0]) {
                                currentalbum = data[0].body[0].id;
                            }
                        }
                        if (data[1].body != null){
                            if ("id" in data[1].body) {
                                currentalbum = data[1].body.id;
                            }
                        }
                        console.log(currentalbum);
                        UploadSuccessfull();                    
                    } else {
                        alert("CreateReplayVideo Album:" + err.status+" ("+err.statusText+"):\n"+err.responseText);
                    }
                });
            } else {
                alert(err.status+" ("+err.statusText+"):\n"+err.responseText);
            }
            });
        }
    } else {
        alert(err.status+" ("+err.statusText+"):\n"+err.responseText);
    }
    });
}

function DecodeAutohilyteMode(mode) {
    var autohilytemode = 'none';
    if (typeof mode === 'boolean') {
        if (mode == true) {
            autohilytemode = 'ai';
        } 
    } else {
        autohilytemode = mode;
    }
    return autohilytemode;
}
