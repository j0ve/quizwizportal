var express = require('express');
var cookieParser = require('cookie-parser');
// library for promises, zodat ik ook dingen synchroon kan doen (in de strijd tegen callback hell, voor queryies die afhankelijk zijn van queries etc)
var q = require('q');
var router = express.Router();
router.use(cookieParser());
// node pakketje om korte uniqe ids te maken
var shortid = require('shortid');
// mysql incliden en verbinding maken met db
var mysql = require('mysql');
var pool = mysql.createPool({
    host: 'localhost',
    user: 'quizwiz',
    password: 'v00rk3nn1s',
    database: 'quizwiz'
});

function getConnectionFromPool() {
    var deferred = q.defer();
    pool.getConnection(function(err, connection) {
        deferred.resolve(connection);
    });
    return deferred.promise;
}


function doAsyncQuery(queryTemplate, parameters, callback) {
    pool.getConnection(function(err, connection) {
        var query = mysql.format(queryTemplate, parameters);
        console.log('Query to execute:' + query);
        connection.query(query, function(error, result) {
            if (error) {
                console.error(error);
            } else {
                callback(result);
            }
        });
    });
}
// opslaan van de IP/cookie combi, om toch een beetje te kunnen monitoren als t drukker wordt
function storeCookieIP(cookieId, IP) {
    // ik gebruik INSERT INGORE, ipv REPLACE, want replace past sowieso een row aan (zij het met 0 wijzigingen), en dan kan ik in t result niet zien of de row al bestond
    // INSERT IGNORE dropt de statement als de row (of althans de primary key) al bestaat, dus dan is affectedrows = 0
    doQuery('INSERT IGNORE INTO TEMP_homepage_cookieIPs SET cookie_id=?, IP=?', [cookieId, IP]).then(function(data) {
        // als affectedrows = 1 dan is het een nieuwe cookie/ip combi, en dan zou je bijv kunnen geolocaten
        if (data.affectedRows === 1) {
            // hier dus geolocate lib aanroepen ofzo
        }
    });
}

function doQuery(queryTemplate, parameters) {
    var deferred = q.defer();
    getConnectionFromPool()
        .then(function(connection) {
            var query = mysql.format(queryTemplate, parameters);
            console.log('Query to execute:' + query);
            connection.query(query, function(error, result) {
                if (error) {
                    console.error(error);
                    deferred.reject(error);
                }
                connection.release();
                deferred.resolve(result);
            });
        })
        .fail(function(err) {
            console.error(JSON.stringify(err));
            deferred.reject(err);
        });

    return deferred.promise;
}


// nieuw: alles opvragen in 1 query, en bovendien alleen een vraag ophalen waarvoor deze cookie id nog geen antwoord heeft gegeven
function getHPQuestion(cookieId) {
    var deferred = q.defer();
    doQuery('SELECT t1.id, t1.question, t2.id AS answer_id, t2.question_id, t2.answer, t2.correct FROM (SELECT id, question FROM TEMP_homepage_questions thq WHERE thq.id NOT IN (SELECT question_id FROM TEMP_homepage_answers tha LEFT JOIN TEMP_homepage_useranswers thu ON thu.answer_id = tha.id AND thu.cookie_id=? WHERE thu.answer_id IS NOT NULL) ORDER BY RAND() LIMIT 1) AS t1 LEFT JOIN TEMP_homepage_answers t2 ON t2.question_id = t1.id ORDER BY displayorder', [cookieId]).then(function(questiondata) {
        var question = {};
        if (questiondata.length !== 0) {
            question.id = questiondata[0].id;
            question.text = questiondata[0].question;
            question.answers = [];
            for (var i = 0; i < questiondata.length; i++) {
                question.answers.push({ "id": questiondata[i].answer_id, "text": questiondata[i].answer, "correct": questiondata[i].correct });
            }
        }
        deferred.resolve(question);
    });
    return deferred.promise;
}

function processHPAnswer(cookieId, answerId) {
    var deferred = q.defer();
    // deze twee queries kan ik best parallel doen. zit geen volgorde in. dus laat ik q.all eens proberen
    // maar wel daarna nog even de score ophalen!
    q.all([doQuery('SELECT correct FROM TEMP_homepage_answers WHERE id=?', answerId), doQuery('INSERT INTO TEMP_homepage_useranswers SET cookie_id=?, answer_id=?', [cookieId, answerId])]).done(function(data) {
        // als het opslaan van het antwoord en het ophalen van de juistheid ervan gebeurd is: eigen score ophalen en score van 2 willekeurige anderen ophalen
        q.all([doQuery('SELECT SUM(tha.correct) AS score FROM TEMP_homepage_useranswers thu LEFT JOIN TEMP_homepage_answers tha ON tha.id = thu.answer_id WHERE thu.cookie_id=?', cookieId), doQuery('SELECT SUM(tha.correct) AS score, thu.cookie_id FROM TEMP_homepage_useranswers thu LEFT JOIN TEMP_homepage_answers tha ON tha.id = thu.answer_id WHERE thu.cookie_id IN (SELECT cookie_id FROM TEMP_homepage_useranswers thu2 WHERE cookie_id != ?) GROUP BY thu.cookie_id ORDER BY score DESC LIMIT 3', cookieId)]).done(function(data2) {
            deferred.resolve({ "correct": data[0][0].correct, "score": data2[0][0].score, "otherscores": data2[1] });
        });
    });
    return deferred.promise;
}

// zelf gemaakte middleware om te checken of het quizwiz koekje bestaat, en zo niet, maken die handel
router.use('/', function(req, res, next) {
    // check if client sent cookie
    if (!("quizwizcookieid" in req.cookies)) {
        // no: set a new cookie
        var uniqid = shortid.generate();
        res.cookie('quizwizcookieid', uniqid, { maxAge: 2147483647, httpOnly: true });
        req.cookies.quizwizcookieid = uniqid;
    } else {
        // yes, cookie was already present 
    }
    // get the remote ip
    var ip = req.headers['x-real-ip'] || 'dev';
    // store the cookie and ip (asynchronously)
    storeCookieIP(req.cookies.quizwizcookieid, ip);
    next(); // <-- important! want hij moet de rest van de pagina nog ladennnnnn
});
/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index');
});
router.post('/hpgetquestion', function(req, res, next) {

    getHPQuestion(req.cookies.quizwizcookieid).done(function(question) {
        res.json(question);
    });
});


router.post('/hpanswerclick/:answerId/', function(req, res, next) {
    processHPAnswer(req.cookies.quizwizcookieid, parseInt(req.params.answerId)).then(function(data) {
        res.json(data);
    });

});
module.exports = router;