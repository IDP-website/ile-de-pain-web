/* Photo library. These are free-licence placeholders (Unsplash, Pexels) for the preview.
   Swap each src for île de païn's own photos: put files in /assets/img/ and point src at them. */
const U=(id,w=1400)=>`https://images.unsplash.com/photo-${id}?w=${w}&q=72&auto=format&fit=crop`;
const P=(id,w=1400)=>`https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;
window.PHOTOS=[
 {id:"loaves",     src:U("1598390475281-9eb7782fb4cf"), alt:"Rustic loaves on a wooden table", cat:"Bakery"},
 {id:"croissants", src:P(30403209), alt:"Croissants fresh out of the oven", cat:"Bakery"},
 {id:"frenchtoast",src:P(10232459), alt:"Brioche French toast with fresh berries", cat:"Breakfast"},
 {id:"latte",      src:P(459489),   alt:"A latte with milk art", cat:"Coffee & drinks"},
 {id:"oven",       src:U("1577083519135-e5e7eb50498e"), alt:"The wood-fired oven, open and glowing", cat:"Behind the scenes"},
 {id:"display",    src:P(38959004), alt:"The bread shelves, fully stocked", cat:"The space"},
 {id:"benedict",   src:P(16556114), alt:"Eggs on toasted bread with greens", cat:"Breakfast"},
 {id:"nata",       src:P(19282132), alt:"A tray of pastéis de nata", cat:"Bakery"},
 {id:"pastries",   src:U("1789152952858-2b2270419149"), alt:"Pastries going into the stone oven", cat:"Behind the scenes"},
 {id:"terrace",    src:P(6304899),  alt:"Tables on the terrace", cat:"The space"},
 {id:"choc",       src:P(28402363), alt:"A slice of rich chocolate cake", cat:"Bakery"},
 {id:"barista",    src:P(32590864), alt:"Milk being poured for a flat white", cat:"Coffee & drinks"},
 {id:"salad",      src:P(842545),   alt:"A bright, fresh salad bowl", cat:"Lunch"},
 {id:"sourdough",  src:P(8633662),  alt:"A sourdough loaf, close up", cat:"Bakery"},
 {id:"oysters",    src:P(37935968), alt:"Fresh oysters with lemon", cat:"Events"},
 {id:"weddingcake",src:P(29051739), alt:"Floral celebration cakes", cat:"Events"},
 {id:"flatbread",  src:U("1777315388484-f999eb67d74c"), alt:"Bread coming out of the fire", cat:"Behind the scenes"},
 {id:"toast2",     src:P(24343228), alt:"French toast and coffee", cat:"Breakfast"},
 {id:"wine",       src:P(5895443),  alt:"Chilled white wine", cat:"Coffee & drinks"},
 {id:"cooling",    src:P(30350350), alt:"Loaves cooling on a rack", cat:"Behind the scenes"},
 {id:"breads",     src:P(9120377),  alt:"Artisan breads on display", cat:"The space"},
 {id:"flatwhite",  src:P(33216070), alt:"A flat white on a wooden table", cat:"Coffee & drinks"},
 {id:"natas2",     src:P(19282127), alt:"Portuguese custard tarts", cat:"Bakery"},
 {id:"cakeslice",  src:P(10249461), alt:"Two slices of layered cake", cat:"Bakery"},
 {id:"terrace2",   src:P(19328829), alt:"A relaxed outdoor café corner", cat:"The space"},
 {id:"weddingcake2",src:P(30233153),alt:"A white cake with flowers", cat:"Events"},
 {id:"bowl",       src:P(17303318), alt:"A colourful lunch bowl", cat:"Lunch"},
 {id:"counter",    src:U("1686154596696-d6f594a98af9"), alt:"A fresh loaf on the counter", cat:"Bakery"},
 {id:"oysters2",   src:P(39440876), alt:"Oysters on ice with herbs", cat:"Events"},
 {id:"pastryshelf",src:P(7405059),  alt:"Pastries and breads, freshly baked", cat:"The space"}
];
window.PHOTO=(id,w)=>{const p=window.PHOTOS.find(p=>p.id===id)||window.PHOTOS[0];return w?p.src.replace(/w=\d+/,"w="+w):p.src};
