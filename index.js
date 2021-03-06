var Twitter     = require('twitter'),
    Async       = require('async'),
    Request     = require('request'),
    settings    = require('./settings.json'),
    Fs          = require('fs'),
    storage     = JSON.parse(Fs.readFileSync('./storage.json'));

var internals   = {
    "calls" : 0
};

var client = new Twitter(settings.auth);

internals.init = function() {
    internals.getFriends(function(err1, res1) {
        if (err1) {
            console.log(err1);
            throw err1;
        }

        internals.getFollowers(function(err2, res2) {
            if (err2) {
                console.log(err2);
                throw err2;
            }

            var mutual      = internals.getMutualRelationships(res1, res2);
            var nonMutual   = internals.getNonMutualRelationships(res1, res2);
            var duchebags   = res1.filter(function(el) {
                return res2.indexOf(el) === -1;
            });

            console.log(new Date());
            console.log();
            console.log(res1.length, 'following');
            console.log(res2.length, 'followers');
            console.log(mutual.length, 'mutual');
            console.log(nonMutual.length, 'nonMutual');
            console.log(duchebags.length, 'duchebags');

            //do the work
            Async.series([
                internals.unfollowAll.bind(this, duchebags)
                // internals.followMany.bind(this, mutual)
                //internals.sendMessages.bind(this, mutual, settings.message)
            ], function(err) {
                internals.save(function() {
                    if (err) {
                        console.log(err);
                        throw err;
                    }

                    console.log('All done!');
                    process.exit();
                });
            });
        });
    });
};

/**
 *  Save to storage
 */
internals.save = function(done) {
    console.log('Saving storage...');
    Fs.writeFile('./storage.json', JSON.stringify(storage, null, 2), done);
};

/**
 *  Get the followers for the current user
 *
 *  Returns a list of ids
 */
internals.getFriends = function(done, id, result, cursor) {
    var params = {
        count:  5000,
        cursor : cursor ? cursor : -1
    };

    if (id) {
        params.user_id = id;
        console.log('Getting friends for ' + id);
        storage.fetched[id] = true;
        internals.save();
    } else {
        console.log('Getting your friends');
    }

    return client.get('friends/ids', params, function(err, res, response) {
        internals.calls++;

        if (err) {
            console.log(res);
        }

        result = (res.ids || []).concat(result ? result : []);

        if (res.next_cursor && !id) {
            return setTimeout(function() {
                internals.getFriends(done, id, result, res.next_cursor_str);
            }, 5000);
        }

        return done(err, result);
    });
};

/**
 *  Get the followers for the current user
 *
 *  Returns a list of ids
 */
internals.getFollowers = function(done, id, result, cursor) {
    var params = {
        count:  5000,
        cursor : cursor ? cursor : -1
    };

    if (id) {
        params.user_id = id;
        console.log('Getting followers for ' + id);
        storage.fetched[id] = true;
        internals.save();
    } else {
        console.log('Getting your followers');
    }

    return client.get('followers/ids', params, function(err, res, response) {
        internals.calls++;

        result = (res.ids || []).concat(result ? result : []);

        if (err) {
            console.log(res);
        }

        if (res.next_cursor && !id) {
            return setTimeout(function() {
                internals.getFollowers(done, id, result, res.next_cursor_str);
            }, 5000);
        }

        return done(err, result);
    });
};

/**
 *  Get random target if its not provided
 */
internals.getRandomTarget = function(arr) {
    if (settings.target) {
        return settings.target;
    }

    var target = null,
        index;

    while (!target && arr.length > 0) {
        index = Math.floor(Math.random() * arr.length);

        target = arr.splice(index, 1)[0];
        if (!storage.fetched[target]) {
            return target;
        }
    }

    return null;
};

/**
 *  Diff a list of user ids and returns the common
 */
internals.getMutualRelationships = function(a1, a2) {
    return a1.filter(function(el) {
        return a2.indexOf(el) > -1;
    });
};

/**
 *  Diff a list of user ids and returns the uncommon
 */
internals.getNonMutualRelationships = function(a1, a2) {
    var longest = a1.length >= a2.length ? a1 : a2,
        mutual  = internals.getMutualRelationships(a1, a2);

    return longest.filter(function(el) {
         return mutual.indexOf(el) === -1;
    });
};

/**
 *  Unfollow all in a given array
 */
internals.unfollowAll = function(duchebags, done) {
    //duchebags = internals.filterOutStuff(duchebags, "unfollowed");
    console.log('Unfollowing ' + duchebags.length + ' duchebags....');

    return Async.eachLimit(duchebags, 1, internals.unfollow, function(err) {
        if (err) {
            console.log('Err thrown in unfollowing duchebags..');
            console.log(err);
        }

        return done();
    });
};

/**
 *  Unfollow a given id.
 */
internals.unfollow = function(id, done) {
    if (storage.unfollowed[id]) {
        console.log('Skipping ' + id + ' bcs already unfollowed!');
        return done();
    }

    var options = {
        "uri" : "https://twitter.com/i/user/unfollow?authenticity_token=" + settings.token + "&challenges_passed=false&handles_challenges=1&impression_id=&user_id=" + id,
        "timeout" : 10000,
        'headers' : {
            'pragma': 'no-cache',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.101 Safari/537.36',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'accept': 'application/json, text/javascript, */*; q=0.01',
            'cache-control': 'no-cache',
            'authority': 'twitter.com',
            'referer': 'https://twitter.com/following',
            'dnt': '1',
            "cookie" : settings.cookie
        },
        'form' : {
            'authenticity_token' : settings.token,
            'challenges_passed' : false,
            'handles_challenges' :1,
            'impression_id' : '',
            'inject_tweet' : false,
            'user_id' : id
        }
    };

    return Request.post(options, function(err, res, body) {
        console.log(err, res, body);
        if (err) {
            if (err.code === "ENOTFOUND" || err.code === "ETIMEDOUT") {
                console.log('Could not fetch, retrying....');
                return setTimeout(function() {
                    return internals.unfollow(id, done);
                }, 30000);
            }

            return done(err);
        }

        storage.unfollowed[id]  = true;

        if (res.statusCode !== 200) {
            console.log('Could not unfollow ' + id + ' ... : ' + (res.message || res.statusCode));
            return done();
        }

        console.log('User ' + id + ' unfollowed!');

        return setTimeout(function() {
            return done(err, res);
        }, Math.floor(Math.random() * settings.timespan + settings.timespan));
    });
};

/**
 *  Get users to follow from the set of ppl following us.
 */
internals.followMany = function(targets, done) {
    console.log('Getting ppl to follow....');
    var target = internals.getRandomTarget(targets);

    if (!target) {
        return done(new Error('No available targets to follow...'));
    }

    return internals.getFollowers(function(err, newUsers) {
        if (err) {
            // if (err[0].code === 32) {
                // console.log('Could not fetch followers from ' + target + ', trying another...');
                // return internals.followMany(targets, done);
            // }

            return done(err);
        }

        if (!newUsers || newUsers.length < 1) {
            return done(new Error('No new users to target :< '));
        }

        console.log('Following ' + newUsers.length + ' champions....');
        return Async.eachLimit(newUsers, 1, internals.follow, function(err) {
            if (err) {
                console.log('Err thrown in following new..');
                console.log(err);
            }

            return done();
        });
    }, target);
};

/**
 *  Follow a given id.
 */
internals.follow = function(id, done) {
    if (storage.unfollowed[id] || storage.followed[id]) {
        console.log('Skipping ' + id + ' bcs already followed!');
        return done();
    }

    var options = {
        "uri" : "https://twitter.com/i/user/follow?authenticity_token=" + settings.token + "&challenges_passed=false&handles_challenges=1&impression_id=&inject_tweet=false&user_id=" + id,
        "timeout" : 10000,
        'headers' : {
            'pragma': 'no-cache',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.101 Safari/537.36',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'accept': 'application/json, text/javascript, */*; q=0.01',
            'cache-control': 'no-cache',
            'authority': 'twitter.com',
            'referer': 'https://twitter.com/following',
            'dnt': '1',
            "cookie" : settings.cookie
        },
        'form' : {
            'authenticity_token' : settings.token,
            'challenges_passed' : false,
            'handles_challenges' :1,
            'impression_id' : '',
            'inject_tweet' : false,
            'user_id' : id
        }
    };

    return Request.post(options, function(err, res, body) {
        if (err) {
            if (err.code === "ENOTFOUND" || err.code === "ETIMEDOUT") {
                console.log('Could not fetch, retrying....');
                return setTimeout(function() {
                    return internals.follow(id, done);
                }, 30000);
            }

            return done(err);
        }

        storage.followed[id]  = true;

        if (res.statusCode !== 200) {
            var body;

            try {
                body = JSON.parse(res.body);
            } catch (err) {
                console.log('Could not follow ' + id + ' for unknown reasons..');
                return done();
            }

            if (!body) {
                console.log('Could not follow ' + id + ' for unknown reasons..');
                return done();
            }

            if (body.message === "You have been blocked from following this account at the request of the user.") {
                console.log('Could not follow this user ' + id);
                return done();
            }

            return done(new Error('Invalid statuscode ' + res.statusCode));
        }

        console.log('User ' + id + ' followed!');

        setTimeout(function() {
            return done(err, res);
        }, Math.floor(Math.random() * settings.timespan + settings.timespan));
    });
};

/**
 *  send multiple messages
 */
internals.sendMessages = function(users, message, done) {
    users = internals.filterOutStuff(users, "messaged").slice(0,250);
    console.log('Messageee ' + users.length + ' ppl....');

    Async.eachLimit(users, 1, function(id, next) {
        return internals.sendMessage(id, message, next);
    }, done)

};

/**
 *  send message to user
 */
internals.sendMessage = function(id, message, done) {
    var params = {
        user_id : id,
        text : message
    };

    return client.post('direct_messages/new', params,  function(err, res, response) {
        if (err) {
            return done(err);
        }

        console.log('Direct message sent to ' + id);
        storage.messaged[id] = true;

        setTimeout(function() {
            return done(null, res);
        }, Math.floor(Math.random() * settings.timespan + 72000));
    });
};

/**
 *  Filter out guys we already dealt with
 */
internals.filterOutStuff = function(arr, key) {
    return arr.filter(function(item) {
        return storage[key][item] ? false : true;
    });
};

//save with regurlarity
setInterval(function() {
    internals.save()
}, 120000);

//internals.unfollow(15537791, function(err,res){});
// internals.follow(3087094572, function(err, res){
    // console.log(arguments);
    // process.exit()
// });
internals.init();
// internals.sendMessage(2752048874, settings.message, function(err, res) {
    // console.log(arguments);
// });
