//alert("Holiguiris"); 

/*
Este es un código
que hace que la pelota
rebote en el borde 
inferior de la pantalla.
*/

let posY = 150;
let velY = 0;

function setup(){
    createCanvas(windowWidth, windowHeight);

}

function draw(){
    background(120);
    fill(255, 150 , 0);
    noStroke();
    circle(width/2, posY, 50);
    posY += velY;
    velY += 0.5;
    //console.log(velY);
    if(posY > height - 25){
        velY *= -0.9;
    }

}
