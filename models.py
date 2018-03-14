# Matt Takao 2018-01-19

# define the one model to rule them all

from app import db

class VehicleSale(db.Model):
    sale_number = db.Column(db.Integer, primary_key = True)
    vin = db.Column(db.String(17))
    make = db.Column(db.String(25))
    model = db.Column(db.String(40))
    year = db.Column(db.Integer)
    price = db.Column(db.Integer)
    buyer = db.Column(db.String(50))
    seller = db.Column(db.String(50))
    date_of_sale = db.Column(db.Date) 
