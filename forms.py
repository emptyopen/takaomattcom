# Matt Takao 2018-01-19

# define forms

from wtforms import Form, StringField, SelectField, \
                    IntegerField, DateField, validators

class SearchVehicleSalesForm(Form):
    choices = [('VIN', 'VIN'),
               ('Make', 'Make'),
               ('Model', 'Model'),
               ('Year', 'Year'),
               ('Price', 'Price'),
               ('Buyer', 'Buyer'),
               ('Seller', 'Seller'),
               ('Date of Sale', 'Date of Sale'),
               ('Make AND Model (separate with /)',
                    'Make AND Model (separate with /)'),
               ('Make AND Model AND Year (/)', 'Make AND Model AND Year (/)'),
               ('Buyer OR Seller', 'Buyer OR Seller')]
    select = SelectField('Search for vehicle sales: (leave blank for all)',
                         choices=choices)
    search = StringField('')

class CreateVehicleSaleForm(Form):
    make_types = [('Mazda', 'Mazda'), ('Honda', 'Honda')]
    vin = StringField('VIN')
    make = StringField('Make')
    model = StringField('Model')
    year = IntegerField('Year')
    price = IntegerField('Price')
    buyer = StringField('Buyer')
    seller = StringField('Seller')
    date_of_sale = DateField('Date of Sale', format = '%Y-%m-%d')
